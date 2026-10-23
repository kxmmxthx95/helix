// Deno Edge Function. Deploy with: supabase functions deploy send-print-email
// Secrets: supabase secrets set GMAIL_USER=... GMAIL_APP_PASSWORD=...
//
// รายการพิมพ์: emails one queued document as an attachment from the shared Gmail account.
// Permission = the caller can read the print request (RLS: can_see_print_request), so the
// department scope matches the tab. Gmail SMTP (nodemailer) over implicit TLS on 465 — Supabase blocks 25/587.
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

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

const BUCKET = "subject-documents";
const MAX_BYTES = 30 * 1024 * 1024; // mirrors the bucket's file_size_limit
// Gmail caps a message at 25MB and base64 adds ~37%, so ~18MB is the largest real attachment.
// Bigger files go out as a signed download link instead.
const MAX_ATTACH_BYTES = 18 * 1024 * 1024;
const LINK_TTL_SECONDS = 7 * 24 * 3600;
const MAX_RECIPIENTS = 5;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    return await handle(req);
  } catch (e) {
    // an uncaught throw would answer 500 without CORS headers, which the browser reports as a CORS error
    return json({ error: `เกิดข้อผิดพลาดในระบบ: ${(e as Error).message}` }, 500);
  }
});

async function handle(req: Request): Promise<Response> {

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing authorization" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const gmailUser = Deno.env.get("GMAIL_USER");
  const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!gmailUser || !gmailPass) return json({ error: "ยังไม่ได้ตั้งค่าอีเมลผู้ส่ง (GMAIL_USER / GMAIL_APP_PASSWORD)" }, 500);

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: authData } = await callerClient.auth.getUser();
  const caller = authData?.user;
  if (!caller) return json({ error: "unauthorized" }, 401);

  let body: { requestId?: string; to?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const to = [...new Set((body.to ?? []).map((e) => String(e).trim()).filter(Boolean))];
  if (!body.requestId) return json({ error: "missing requestId" }, 400);
  if (to.length === 0) return json({ error: "กรุณาระบุอีเมลผู้รับ" }, 400);
  if (to.length > MAX_RECIPIENTS) return json({ error: `ส่งได้ไม่เกิน ${MAX_RECIPIENTS} ที่อยู่ต่อครั้ง` }, 400);
  const bad = to.find((e) => !EMAIL_RE.test(e));
  if (bad) return json({ error: `อีเมลไม่ถูกต้อง: ${bad}` }, 400);

  // RLS on the caller's client is the permission check.
  const { data: request } = await callerClient
    .from("doc_print_requests")
    .select("id, department_id, copies, note, doc_files(title, file_name, file_path)")
    .eq("id", body.requestId)
    .maybeSingle();
  const file = (request as { doc_files: { title: string; file_name: string; file_path: string } | null } | null)?.doc_files;
  if (!request || !file) return json({ error: "ไม่พบคำขอพิมพ์หรือไม่มีสิทธิ์ดูไฟล์นี้" }, 404);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: blob, error: dlError } = await admin.storage.from(BUCKET).download(file.file_path);
  if (dlError || !blob) return json({ error: "ดาวน์โหลดไฟล์ไม่สำเร็จ" }, 500);
  if (blob.size > MAX_BYTES) return json({ error: "ไฟล์ใหญ่เกิน 30MB ส่งทางอีเมลไม่ได้" }, 400);

  const { data: me } = await admin.from("profiles").select("first_name, last_name").eq("id", caller.id).maybeSingle();
  const sender = me ? `${me.first_name} ${me.last_name}` : "ผู้ใช้ระบบ";
  const r = request as { id: string; department_id: string | null; copies: number; note: string | null };

  const lines = [`ไฟล์: ${file.title}`, `จำนวน: ${r.copies} ชุด`];
  if (r.note) lines.push(`หมายเหตุ: ${r.note}`);
  const asLink = blob.size > MAX_ATTACH_BYTES;
  if (asLink) {
    const { data: signed, error: signError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(file.file_path, LINK_TTL_SECONDS, { download: file.file_name });
    if (signError || !signed) return json({ error: "สร้างลิงก์ดาวน์โหลดไม่สำเร็จ" }, 500);
    lines.push(`ไฟล์ใหญ่เกินกว่าจะแนบ ดาวน์โหลดได้ที่ (ลิงก์หมดอายุใน 7 วัน): ${signed.signedUrl}`);
  }
  lines.push("", `ส่งโดย ${sender} (Helix)`);

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
  });
  // ประวัติการส่ง: one row per attempt, sent or failed. A logging failure must not fail the send.
  const record = async (status: "sent" | "failed", error?: string) => {
    const { error: logError } = await admin.from("doc_print_emails").insert({
      request_id: r.id,
      department_id: r.department_id,
      doc_title: file.title,
      file_name: file.file_name,
      copies: r.copies,
      recipients: to,
      sent_by: caller.id,
      status,
      error: error ?? null,
    });
    if (logError) console.error("doc_print_emails insert failed:", logError.message);
  };
  try {
    await transport.sendMail({
      from: { name: `Helix (${sender})`, address: gmailUser },
      to,
      subject: `ขอให้พิมพ์เอกสาร: ${file.title} (${r.copies} ชุด)`,
      text: lines.join("\n"),
      attachments: asLink
        ? []
        : [
            {
              filename: file.file_name,
              content: new Uint8Array(await blob.arrayBuffer()),
              contentType: blob.type || "application/octet-stream",
            },
          ],
    });
  } catch (e) {
    await record("failed", (e as Error).message.slice(0, 500));
    return json({ error: `ส่งอีเมลไม่สำเร็จ: ${(e as Error).message}` }, 502);
  } finally {
    transport.close();
  }

  await record("sent");
  return json({ ok: true });
}
