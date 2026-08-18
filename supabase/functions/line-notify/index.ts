// Deno Edge Function. Deploy with: supabase functions deploy line-notify --no-verify-jwt
//
// Drains the line_notifications queue (migration 0040): called every 5
// minutes by a pg_cron + pg_net job, which also re-runs
// enqueue_due_assignment_notifications() first to pick up scheduled posts —
// see the migration comment for why this is 5-minute-polled rather than
// instant. Auth is a shared secret (line_notify_cron_secret, stored in
// Supabase Vault) rather than a user JWT, since the caller is Postgres
// itself, not a logged-in user.
import { createClient } from "jsr:@supabase/supabase-js@2";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // vault.decrypted_secrets isn't reachable via PostgREST (only
  // public/graphql_public are exposed) — read_vault_secret (migration
  // 0046) is the RPC workaround, callable only by service_role.
  const { data: expected } = await admin.rpc("read_vault_secret", { secret_name: "line_notify_cron_secret" });
  if (!expected || req.headers.get("x-cron-secret") !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  const { data: pending, error } = await admin
    .from("line_notifications")
    .select("id, profile_id, message")
    .eq("status", "pending")
    .limit(BATCH_SIZE);
  if (error) return new Response(error.message, { status: 500 });

  for (const row of pending ?? []) {
    const { data: profile } = await admin.from("profiles").select("line_user_id").eq("id", row.profile_id).single();
    if (!profile?.line_user_id) {
      await admin.from("line_notifications").update({ status: "error", error: "no line_user_id" }).eq("id", row.id);
      continue;
    }

    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ to: profile.line_user_id, messages: [{ type: "text", text: row.message }] }),
    });

    if (res.ok) {
      await admin.from("line_notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
    } else {
      await admin.from("line_notifications").update({ status: "error", error: await res.text() }).eq("id", row.id);
    }
  }

  return new Response(JSON.stringify({ processed: pending?.length ?? 0 }), { status: 200 });
});
