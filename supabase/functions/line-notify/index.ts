// Deno Edge Function. Deploy with: supabase functions deploy line-notify --no-verify-jwt
//
// Drains the line_notifications queue (migration 0040): called every 5
// minutes by a pg_cron + pg_net job (which also re-runs
// enqueue_due_assignment_notifications() first to pick up scheduled posts),
// and immediately after inserts by a statement trigger (migration 0185).
// Each row goes out over LINE (if the profile linked it and has it enabled)
// AND as web push to every subscribed device (push_subscriptions, 0185);
// the row is "sent" if either channel delivered. Auth is a shared secret
// (line_notify_cron_secret, stored in Supabase Vault) rather than a user JWT,
// since the caller is Postgres itself, not a logged-in user.
//
// Secrets for push: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (mailto: or https: URL). Generate with `npx web-push generate-vapid-keys`.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const pushEnabled = !!(vapidPublic && vapidPrivate);
  if (pushEnabled) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com", vapidPublic!, vapidPrivate!);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // vault.decrypted_secrets isn't reachable via PostgREST (only
  // public/graphql_public are exposed) — read_vault_secret (migration
  // 0046) is the RPC workaround, callable only by service_role.
  const { data: expected } = await admin.rpc("read_vault_secret", { secret_name: "line_notify_cron_secret" });
  if (!expected || req.headers.get("x-cron-secret") !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  // Rows are claimed (status 'sending') so overlapping drains never double-send.
  const { data: pending, error } = await admin.rpc("claim_line_notifications", { p_limit: BATCH_SIZE });
  if (error) return new Response(error.message, { status: 500 });

  for (const row of (pending ?? []) as { id: string; profile_id: string; message: string }[]) {
    const errors: string[] = [];
    let delivered = false;

    const { data: profile } = await admin
      .from("profiles")
      .select("line_user_id, line_notifications_enabled")
      .eq("id", row.profile_id)
      .single();

    if (!profile?.line_user_id) errors.push("no line_user_id");
    else if (!profile.line_notifications_enabled) errors.push("line disabled");
    else {
      const res = await fetch(LINE_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ to: profile.line_user_id, messages: [{ type: "text", text: row.message }] }),
      });
      if (res.ok) delivered = true;
      else errors.push(`line: ${await res.text()}`);
    }

    if (pushEnabled) {
      const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("profile_id", row.profile_id);
      if (!subs?.length) errors.push("no push subscription");
      for (const sub of subs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: "Helix", body: row.message }),
          );
          delivered = true;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          // 404/410 = subscription gone (app uninstalled / permission revoked): drop it.
          if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", sub.id);
          else errors.push(`push: ${(e as Error).message}`);
        }
      }
    }

    await admin
      .from("line_notifications")
      .update(delivered ? { status: "sent", sent_at: new Date().toISOString() } : { status: "error", error: errors.join("; ") || "no channel" })
      .eq("id", row.id);
  }

  return new Response(JSON.stringify({ processed: pending?.length ?? 0 }), { status: 200 });
});
