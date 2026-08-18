// Deno Edge Function. Deploy with: supabase functions deploy sync-holidays
//
// Pulls Thailand's public holiday calendar from Google Calendar (the
// "en.th.official#holiday@group.v.calendar.google.com" public calendar — free,
// no OAuth, just an API key) and upserts them into academic_events
// (event_type='holiday', whole-school — no department link). The calendar
// only publishes English names (e.g. "New Year's Day") — THAI_NAME below
// translates the known set; anything new falls back to the English summary
// rather than failing the sync. Called two ways, same body: a manual button
// in AcademicEvents.tsx (user JWT, org-wide only) and a yearly pg_cron job
// (x-cron-secret, see migration 0045) that has no logged-in user to check
// roles against.
//
// external_ref (the calendar's own date, deduped as `gcal:<date>`) is the
// upsert key — re-running sync never duplicates a holiday already pulled
// in, and never touches events created by hand (external_ref stays null on
// those).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CALENDAR_ID = "en.th.official#holiday@group.v.calendar.google.com";
const GCAL_EVENTS_URL = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;

/** Google's all-day `end.date` is exclusive (day after the last day) — subtract one to match academic_events' inclusive end_date. */
function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Base holiday names as the calendar publishes them — "Day off for X" /
// "X observed" variants are handled separately below (compensatory-holiday
// wording), not listed here again.
const THAI_NAME: Record<string, string> = {
  "New Year's Day": "วันขึ้นปีใหม่",
  "New Year's Eve": "วันสิ้นปี",
  "New Year Special Holiday": "วันหยุดพิเศษ (ปีใหม่)",
  "Makha Bucha": "วันมาฆบูชา",
  "Chakri Day": "วันจักรี",
  Songkran: "วันสงกรานต์",
  "Songkran Holiday": "วันหยุดสงกรานต์",
  "Labor Day": "วันแรงงานแห่งชาติ",
  "Coronation Day": "วันฉัตรมงคล",
  "Royal Ploughing Ceremony Day": "วันพืชมงคล",
  "Visakha Bucha": "วันวิสาขบูชา",
  "Queen Suthida's Birthday": "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี",
  "Asalha Bucha": "วันอาสาฬหบูชา",
  "King Vajiralongkorn's Birthday": "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว",
  "The Queen Mother's Birthday": "วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง (วันแม่แห่งชาติ)",
  "Chulalongkorn Day": "วันปิยมหาราช",
  "King Bhumibol's Birthday": "วันคล้ายวันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระบรมชนกาธิเบศร (วันพ่อแห่งชาติ)",
  "Constitution Day": "วันรัฐธรรมนูญ",
  "Anniversary of the Death of King Bhumibol": "วันคล้ายวันสวรรคตพระบาทสมเด็จพระบรมชนกาธิเบศร",
};

/** Translates a Google Calendar holiday summary to Thai, keeping "Day off for X" / "X observed" (ชดเชยวันหยุด) wording consistent. Falls back to the English name for anything not yet mapped. */
function toThaiName(summary: string): string {
  if (THAI_NAME[summary]) return THAI_NAME[summary];

  const dayOffMatch = summary.match(/^Day off for (.+)$/);
  if (dayOffMatch && THAI_NAME[dayOffMatch[1]]) return `ชดเชย${THAI_NAME[dayOffMatch[1]]}`;

  const observedMatch = summary.match(/^(.+) observed$/);
  if (observedMatch && THAI_NAME[observedMatch[1]]) return `ชดเชย${THAI_NAME[observedMatch[1]]}`;

  return summary;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type GCalEvent = { summary: string; start: { date?: string }; end: { date?: string } };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    // vault.decrypted_secrets isn't reachable via PostgREST (only
    // public/graphql_public are exposed) — read_vault_secret (migration
    // 0046) is the RPC workaround, callable only by service_role.
    const { data: expected } = await admin.rpc("read_vault_secret", { secret_name: "holiday_sync_cron_secret" });
    if (!expected || cronSecret !== expected) {
      return json({ error: "unauthorized" }, 401);
    }
  } else {
    // Manual call — same org-wide check as any org-wide-only mutation
    // (service-role below bypasses RLS, so this is the only gate).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing authorization" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await callerClient.auth.getUser();
    const caller = authData?.user;
    if (!caller) return json({ error: "unauthorized" }, 401);

    const { data: roleRows } = await callerClient.from("profile_roles").select("role").eq("profile_id", caller.id);
    const roles = (roleRows ?? []).map((r) => r.role as string);
    const orgWide = roles.some((r) => ["super_admin", "director", "staff"].includes(r));
    if (!orgWide) return json({ error: "forbidden" }, 403);
  }

  const { data: apiKey } = await admin.rpc("read_vault_secret", { secret_name: "google_calendar_api_key" });
  if (!apiKey) return json({ error: "google_calendar_api_key not configured in vault" }, 500);

  let years: number[];
  try {
    const body = await req.json();
    years = Array.isArray(body.years) && body.years.length > 0 ? body.years : [new Date().getFullYear()];
  } catch {
    years = [new Date().getFullYear()];
  }

  const upserted: string[] = [];
  const errors: string[] = [];

  for (const year of years) {
    const params = new URLSearchParams({
      key: apiKey,
      timeMin: `${year}-01-01T00:00:00Z`,
      timeMax: `${year + 1}-01-01T00:00:00Z`,
      singleEvents: "true",
      orderBy: "startTime",
    });
    const res = await fetch(`${GCAL_EVENTS_URL}?${params}`);
    if (!res.ok) {
      errors.push(`year ${year}: ${await res.text()}`);
      continue;
    }
    const body: { items: GCalEvent[] } = await res.json();

    for (const ev of body.items) {
      if (!ev.start.date || !ev.end.date) continue; // skip any non-all-day entry — holidays are always all-day
      const startDate = ev.start.date;
      const endDate = dayBefore(ev.end.date);

      const { error } = await admin
        .from("academic_events")
        .upsert(
          {
            external_ref: `gcal:${startDate}`,
            name: toThaiName(ev.summary),
            event_type: "holiday",
            start_date: startDate,
            end_date: endDate,
            students_attend: false,
            staff_attend: false,
          },
          { onConflict: "external_ref" },
        );
      if (error) errors.push(`${startDate} ${ev.summary}: ${error.message}`);
      else upserted.push(startDate);
    }
  }

  return json({ upserted: upserted.length, errors });
});
