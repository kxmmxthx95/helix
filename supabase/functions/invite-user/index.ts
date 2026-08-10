// Deno Edge Function. Deploy with: supabase functions deploy invite-user
//
// profiles.id is a foreign key into auth.users, so a login account has to
// exist before a profile row can. The browser only ever holds the anon key,
// which can't create auth accounts — that needs the service-role key, which
// must never reach the client. This function is the only place that key is
// used: it re-checks the caller's permissions itself (the service-role client
// bypasses RLS, so nothing here can rely on the database to say no) and only
// then creates the account and writes profiles/profile_roles/students for it.
//
// There's no real inbox to invite (student_code / phone aren't email), so
// unlike a typical Supabase invite flow, the caller sets the password
// directly here rather than the user picking one via an emailed link.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { syntheticEmail } from "../_shared/auth-domains.ts";

// User administration is super_admin-only (grill decision) — narrower than
// can_manage() in the database, which still lets director/staff/dept_head
// manage the roster.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UserInput = {
  kind: "staff" | "student";
  loginId: string; // phone (staff) or student_code (student)
  password: string;
  prefix: string | null;
  first_name: string;
  last_name: string;
  email: string | null; // optional contact email — never the login identity
  national_id: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  department_id: string | null;
  roles: string[]; // ignored when kind === "student" (always just ["student"])
  positionTitleIds: string[]; // ignored when kind === "student"
  studentRowId?: string; // kind === "student": links students.profile_id
  teacher_code: string | null;
  learning_area_id: string | null; // required when roles includes "teacher"
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

  // Scoped to the caller's own JWT — RLS still applies, so this can only ever
  // see what the caller themselves is already allowed to see.
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

  const callerRoles = (callerRoleRows ?? []).map((r) => r.role as string);
  if (!callerRoles.includes("super_admin")) return json({ error: "forbidden" }, 403);

  let body: { users?: UserInput[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const users = body.users;
  if (!Array.isArray(users) || users.length === 0) return json({ error: "no users" }, 400);

  // Service-role client — bypasses RLS entirely. Safe here only because every
  // row below was already checked against the caller's own scope above.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const inserted: string[] = [];
  const skipped: { loginId: string; reason: string }[] = [];

  for (const u of users) {
    const email = syntheticEmail(u.loginId, u.kind);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: u.password,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      skipped.push({ loginId: u.loginId, reason: createError?.message ?? "สร้างบัญชีไม่สำเร็จ" });
      continue;
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      prefix: u.prefix,
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      phone: u.kind === "staff" ? u.loginId : null,
      national_id: u.national_id,
      date_of_birth: u.date_of_birth,
      department_id: u.department_id,
      teacher_code: u.teacher_code,
      learning_area_id: u.learning_area_id,
    });
    if (profileError) {
      skipped.push({ loginId: u.loginId, reason: profileError.message });
      continue;
    }

    if (u.kind === "student" && u.studentRowId) {
      const { error: linkError } = await admin
        .from("students")
        .update({ profile_id: created.user.id })
        .eq("id", u.studentRowId);
      if (linkError) {
        skipped.push({ loginId: u.loginId, reason: linkError.message });
        continue;
      }
    }

    const roles = u.kind === "student" ? ["student"] : u.roles.filter((r) => r !== "dept_head");
    const positionTitleIds = u.kind === "student" ? [] : u.positionTitleIds;

    const roleRows = [
      ...roles.map((role) => ({ profile_id: created.user.id, role, position_title_id: null })),
      ...positionTitleIds.map((position_title_id) => ({
        profile_id: created.user.id,
        role: "dept_head",
        position_title_id,
      })),
    ];
    if (roleRows.length > 0) {
      const { error: roleError } = await admin.from("profile_roles").insert(roleRows);
      if (roleError) {
        skipped.push({ loginId: u.loginId, reason: roleError.message });
        continue;
      }
    }

    inserted.push(u.loginId);
  }

  return json({ inserted: inserted.length, skipped });
});
