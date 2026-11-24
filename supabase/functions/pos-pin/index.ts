// Deno Edge Function. Deploy with: supabase functions deploy pos-pin --no-verify-jwt
// Secret needed: supabase secrets set POS_PIN_SECRET=<long random string>
//
// POS terminals sign in with a 6-digit PIN instead of a username/password. Each pos_terminals row owns one
// cashier account whose real password is HMAC(POS_PIN_SECRET, terminal_id:pin), so the account can't be
// reached with a short PIN through the normal Supabase login — only through `login` here, which counts
// wrong tries per terminal (migration 0212: 5 wrong -> 15 min lock).
//
// Actions (JSON body { action, ... }):
//   terminal_info {terminal_id}              anon  -> { name, has_pin, active }
//   login         {terminal_id, pin}         anon  -> { status: "ok", session } | { status: "bad"|"locked", ... }
//   pair_list     {loginId, password}        admin credentials -> { terminals }  (no session is kept)
//   set_pin       {terminal_id, pin?}        org-wide caller JWT -> { pin }  (random when pin omitted)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { syntheticEmail } from "../_shared/auth-domains.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ORG_WIDE = ["super_admin", "director", "staff"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function derivePassword(terminalId: string, pin: string): Promise<string> {
  const secret = Deno.env.get("POS_PIN_SECRET");
  if (!secret) throw new Error("POS_PIN_SECRET not set");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${terminalId}:${pin}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same digit, or a straight run up/down (123456, 654321): trivially guessable. */
function weakPin(pin: string): boolean {
  const d = [...pin].map(Number);
  const step = d[1] - d[0];
  return (step === 0 || step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step);
}

function randomPin(): string {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const pin = String(n).padStart(6, "0");
    if (!weakPin(pin)) return pin;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Record<string, string | undefined>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const anon = () => createClient(url, anonKey, { auth: { persistSession: false } });

  const isOrgWide = async (userId: string) => {
    const { data } = await admin.from("profile_roles").select("role").eq("profile_id", userId);
    return (data ?? []).some((r) => ORG_WIDE.includes(r.role as string));
  };

  const terminalId = body.terminal_id ?? "";
  const uuid = /^[0-9a-f-]{36}$/i;

  switch (body.action) {
    case "terminal_info": {
      if (!uuid.test(terminalId)) return json({ error: "not found" }, 404);
      const { data: t } = await admin.from("pos_terminals").select("name, active, profile_id").eq("id", terminalId).maybeSingle();
      if (!t) return json({ error: "not found" }, 404);
      return json({ name: t.name, active: t.active, has_pin: !!t.profile_id });
    }

    case "login": {
      const pin = body.pin ?? "";
      if (!uuid.test(terminalId) || !/^\d{6}$/.test(pin)) return json({ status: "bad" });
      const { data: t } = await admin.from("pos_terminals").select("active, profile_id").eq("id", terminalId).maybeSingle();
      if (!t || !t.active || !t.profile_id) return json({ status: "bad" });

      const { data: gate } = await admin.rpc("pos_pin_gate", { p_terminal: terminalId });
      if (gate?.status === "locked") return json(gate);

      const { data, error } = await anon().auth.signInWithPassword({
        email: syntheticEmail(`pos-${terminalId}`, "staff"),
        password: await derivePassword(terminalId, pin),
      });
      const { data: result } = await admin.rpc("pos_pin_result", { p_terminal: terminalId, p_ok: !error });
      if (error || !data.session) return json(result ?? { status: "bad" });
      return json({ status: "ok", session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
    }

    case "pair_list": {
      const { data, error } = await anon().auth.signInWithPassword({
        email: syntheticEmail((body.loginId ?? "").trim(), "staff"),
        password: body.password ?? "",
      });
      if (error || !data.user || !(await isOrgWide(data.user.id))) return json({ error: "forbidden" }, 403);
      const { data: terminals } = await admin.from("pos_terminals").select("id, name").eq("active", true).order("name");
      return json({ terminals: terminals ?? [] });
    }

    case "set_pin": {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "missing authorization" }, 401);
      const { data: u } = await createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } }).auth.getUser();
      if (!u.user) return json({ error: "unauthorized" }, 401);
      if (!(await isOrgWide(u.user.id))) return json({ error: "forbidden" }, 403);

      const pin = body.pin ?? randomPin();
      if (!/^\d{6}$/.test(pin)) return json({ error: "PIN ต้องเป็นตัวเลข 6 หลัก" }, 400);
      if (weakPin(pin)) return json({ error: "PIN เดาง่ายเกินไป (เลขซ้ำหรือเรียงกัน)" }, 400);
      if (!uuid.test(terminalId)) return json({ error: "not found" }, 404);
      const { data: t } = await admin.from("pos_terminals").select("name, profile_id").eq("id", terminalId).maybeSingle();
      if (!t) return json({ error: "not found" }, 404);

      const password = await derivePassword(terminalId, pin);
      if (t.profile_id) {
        const { error } = await admin.auth.admin.updateUserById(t.profile_id, { password });
        if (error) return json({ error: error.message }, 500);
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: syntheticEmail(`pos-${terminalId}`, "staff"),
          password,
          email_confirm: true,
        });
        if (error || !created.user) return json({ error: error?.message ?? "สร้างบัญชีไม่สำเร็จ" }, 500);
        const id = created.user.id;
        // Roll the half-made account back: profile / roles cascade from auth.users.
        const fail = async (message: string) => {
          await admin.auth.admin.deleteUser(id);
          return json({ error: message }, 500);
        };
        const { error: pe } = await admin.from("profiles").insert({ id, first_name: t.name, last_name: "POS", must_change_password: false });
        if (pe) return await fail(pe.message);
        const { error: re } = await admin.from("profile_roles").insert({ profile_id: id, role: "cashier", position_title_id: null });
        if (re) return await fail(re.message);
        const { error: te } = await admin.from("pos_terminals").update({ profile_id: id }).eq("id", terminalId);
        if (te) return await fail(te.message);
      }
      await admin.from("pos_terminal_pin_attempts").upsert({ terminal_id: terminalId, failed_attempts: 0, locked_until: null });
      return json({ pin });
    }

    default:
      return json({ error: "unknown action" }, 400);
  }
});
