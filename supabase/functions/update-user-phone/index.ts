// Deno Edge Function. Deploy with: supabase functions deploy update-user-phone
//
// A staff member's phone is their login id: auth.users.email is the synthetic
// `<phone>@staff.helix.internal`, so changing it means touching auth, which
// only the service-role key can do. Students sign in with student_code, so
// their phone is plain contact info (profiles.phone only).
// super_admin-only, like invite-user / delete-user.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { syntheticEmail } from "../_shared/auth-domains.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing authorization" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData } = await callerClient.auth.getUser();
  const caller = authData?.user;
  if (!caller) return json({ error: "unauthorized" }, 401);

  const { data: callerRoleRows } = await callerClient
    .from("profile_roles")
    .select("role")
    .eq("profile_id", caller.id);
  if (!(callerRoleRows ?? []).some((r) => r.role === "super_admin")) return json({ error: "forbidden" }, 403);

  let body: { userId?: string; phone?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const { userId } = body;
  const phone = body.phone ? body.phone.replace(/\D/g, "") : null;
  if (!userId) return json({ error: "missing userId" }, 400);
  if (phone && phone.length !== 10) return json({ error: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: roleRows } = await admin.from("profile_roles").select("role").eq("profile_id", userId);
  const isStudent = (roleRows ?? []).some((r) => r.role === "student");

  if (isStudent) {
    const { error } = await admin.from("profiles").update({ phone }).eq("id", userId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (!phone) return json({ error: "บุคลากรต้องมีเบอร์โทร เพราะใช้เป็นรหัสเข้าระบบ" }, 400);

  const { data: current } = await admin.auth.admin.getUserById(userId);
  const oldEmail = current?.user?.email;
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email: syntheticEmail(phone, "staff"),
    email_confirm: true,
  });
  if (authError) {
    const dup = /already|registered|exists/i.test(authError.message);
    return json({ error: dup ? "เบอร์โทรนี้ถูกใช้เป็นรหัสเข้าระบบแล้ว" : authError.message }, 400);
  }

  const { error: profileError } = await admin.from("profiles").update({ phone }).eq("id", userId);
  if (profileError) {
    // Keep auth and profiles in step: put the old login id back.
    if (oldEmail) await admin.auth.admin.updateUserById(userId, { email: oldEmail, email_confirm: true });
    return json({ error: profileError.message }, 400);
  }

  return json({ ok: true });
});
