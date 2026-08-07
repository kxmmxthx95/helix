// Deno Edge Function. Deploy with:
//   supabase functions deploy reset-password --no-verify-jwt
//
// Public — called before the user is signed in, so there's no JWT to check.
// Identity is proven with login_id + national_id + date_of_birth instead
// (grill decision: no real inbox to email a reset link to). Those three
// factors aren't secret-grade, so a 5-attempts/15-minute lockout per
// login_id guards against brute-forcing date_of_birth (~30k possibilities).
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: { loginId?: string; nationalId?: string; dateOfBirth?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const { loginId, nationalId, dateOfBirth, newPassword } = body;
  if (!loginId || !nationalId || !dateOfBirth || !newPassword) {
    return json({ error: "missing fields" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Service-role — this table has no RLS policies at all, so only this key
  // (or the dashboard) can ever touch it.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: attempt } = await admin
    .from("password_reset_attempts")
    .select("attempt_count, first_attempt_at")
    .eq("login_id", loginId)
    .maybeSingle();

  const windowExpired =
    !!attempt && Date.now() - new Date(attempt.first_attempt_at).getTime() > WINDOW_MS;

  if (attempt && !windowExpired && attempt.attempt_count >= MAX_ATTEMPTS) {
    return json({ error: "ลองผิดหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง" }, 429);
  }

  async function recordFailure() {
    if (!attempt || windowExpired) {
      await admin.from("password_reset_attempts").upsert({
        login_id: loginId,
        attempt_count: 1,
        first_attempt_at: new Date().toISOString(),
      });
    } else {
      await admin
        .from("password_reset_attempts")
        .update({ attempt_count: attempt.attempt_count + 1 })
        .eq("login_id", loginId);
    }
  }

  // Staff/director/etc. — matched by phone.
  const { data: staffMatch } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", loginId)
    .eq("national_id", nationalId)
    .eq("date_of_birth", dateOfBirth)
    .maybeSingle();

  let targetId: string | undefined = staffMatch?.id;

  // Student — matched by student_code, via the linked profile.
  if (!targetId) {
    const { data: studentRow } = await admin
      .from("students")
      .select("profile_id")
      .eq("student_code", loginId)
      .not("profile_id", "is", null)
      .maybeSingle();

    if (studentRow?.profile_id) {
      const { data: studentProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("id", studentRow.profile_id)
        .eq("national_id", nationalId)
        .eq("date_of_birth", dateOfBirth)
        .maybeSingle();
      targetId = studentProfile?.id;
    }
  }

  if (!targetId) {
    await recordFailure();
    // Deliberately generic — doesn't reveal which of the three factors was wrong.
    return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(targetId, {
    password: newPassword,
  });
  if (updateError) {
    await recordFailure();
    return json({ error: "ตั้งรหัสผ่านไม่สำเร็จ ลองใหม่อีกครั้ง" }, 500);
  }

  await admin.from("password_reset_attempts").delete().eq("login_id", loginId);
  return json({ success: true });
});
