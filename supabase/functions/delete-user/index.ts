// Deno Edge Function. Deploy with: supabase functions deploy delete-user
//
// profiles.id FKs into auth.users, so removing a login must go through
// auth.admin.deleteUser (cascades to profiles). The browser only has the
// anon key — this function holds the service-role key and re-checks that
// the caller is super_admin before deleting.
import { createClient } from "jsr:@supabase/supabase-js@2";

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

  const callerRoles = (callerRoleRows ?? []).map((r) => r.role as string);
  if (!callerRoles.includes("super_admin")) return json({ error: "forbidden" }, 403);

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const userId = body.userId;
  if (!userId) return json({ error: "missing userId" }, 400);
  if (userId === caller.id) return json({ error: "cannot delete yourself" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message }, 400);

  return json({ ok: true });
});
