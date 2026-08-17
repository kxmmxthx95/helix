// Deno Edge Function. Deploy with: supabase functions deploy line-webhook --no-verify-jwt
//
// Public LINE Messaging API webhook — must be registered as this channel's
// webhook URL in the LINE Developers console (manual step, outside this
// repo). Verifies X-Line-Signature with LINE_CHANNEL_SECRET (the only place
// that secret is used, same "service-role key never leaves one function"
// convention as invite-user's SUPABASE_SERVICE_ROLE_KEY) rather than relying
// on a Supabase JWT — LINE's servers don't carry one.
//
// Linking flow: a profile generates a one-time code in-app (line_link_codes,
// see Profile.tsx's ผูกบัญชี LINE card) and sends it as a chat message to the
// school's OA. This function matches that text against an unexpired/unused
// code and points profiles.line_user_id at the sender.
import { createClient } from "jsr:@supabase/supabase-js@2";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

async function reply(replyToken: string, text: string, accessToken: string) {
  await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
};

Deno.serve(async (req) => {
  const bodyText = await req.text();
  const channelSecret = Deno.env.get("LINE_CHANNEL_SECRET")!;
  const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

  const ok = await verifySignature(bodyText, req.headers.get("X-Line-Signature"), channelSecret);
  if (!ok) return new Response("invalid signature", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { events } = JSON.parse(bodyText) as { events: LineEvent[] };

  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text") continue;
    const userId = event.source?.userId;
    const replyToken = event.replyToken;
    const code = event.message.text?.trim().toUpperCase();
    if (!userId || !replyToken || !code) continue;

    const { data: linkCode } = await admin
      .from("line_link_codes")
      .select("code, profile_id, expires_at, used_at")
      .eq("code", code)
      .maybeSingle();

    if (!linkCode || linkCode.used_at || new Date(linkCode.expires_at) < new Date()) {
      await reply(replyToken, "ไม่พบรหัส หรือรหัสหมดอายุแล้ว ลองสร้างรหัสใหม่ในระบบ", accessToken);
      continue;
    }

    await admin.from("profiles").update({ line_user_id: userId }).eq("id", linkCode.profile_id);
    await admin.from("line_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code);
    await reply(replyToken, "ผูกบัญชีสำเร็จ — จะได้รับแจ้งเตือนงาน/คะแนนทาง LINE", accessToken);
  }

  return new Response("ok", { status: 200 });
});
