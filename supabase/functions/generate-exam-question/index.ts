// Deno Edge Function. Deploy with: supabase functions deploy generate-exam-question
//
// Backs the AI chat drawer for คลังข้อสอบ — teacher chats about what they
// want, model asks follow-ups until it has enough (topic/type/difficulty),
// then answers with a finished question. Client resends the whole message
// history each turn (this function is stateless); model always answers in
// the {reply, done, question} envelope below so the UI can render `reply`
// as a chat bubble and, once `done`, drop `question` straight into the
// exam_questions form fields. verify-jwt stays on (default): any logged-in
// teacher can draft, the actual insert still goes through exam_questions'
// normal RLS when they hit "บันทึก".
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "moonshotai/kimi-k2-instruct";

type ChoiceOut = { label: string; is_correct: boolean };
type GeneratedQuestion = {
  type: "multiple_choice" | "true_false" | "short_answer";
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  prompt: string;
  choices: ChoiceOut[];
  correct_answer: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SYSTEM = `คุณเป็นผู้ช่วยครูไทยออกข้อสอบ คุยกับครูเพื่อรวบรวมข้อมูลที่จำเป็น (หัวข้อ, ประเภทคำถาม, ระดับความยาก) ถ้าข้อมูลยังไม่พอ ให้ถามคำถามสั้นๆ ต่อ (done=false, question=null) ถ้าข้อมูลพอแล้วให้แต่งข้อสอบ 1 ข้อทันที (done=true พร้อม question) ทุกข้อความเป็นภาษาไทย ตอบเป็น JSON เท่านั้นตาม schema นี้ ห้ามมีข้อความอื่นนอก JSON:
{
  "reply": string (ข้อความคุยกับครู — คำถามต่อ หรือสรุปว่าสร้างข้อสอบให้แล้ว),
  "done": boolean,
  "question": null หรือ {
    "type": "multiple_choice" | "true_false" | "short_answer",
    "difficulty": "easy" | "medium" | "hard",
    "topic": string,
    "prompt": string (โจทย์),
    "choices": [{"label": string, "is_correct": boolean}, ...],
    "correct_answer": string หรือ null
  }
}
กติกาของ choices/correct_answer ตาม type:
- multiple_choice: choices มี 4 ข้อ ต้องมี is_correct เป็น true เพียง 1 ข้อ, correct_answer เป็น null
- true_false: choices เป็น [{"label":"ถูก","is_correct":...},{"label":"ผิด","is_correct":...}] เท่านั้น, correct_answer เป็น null
- short_answer: choices เป็น [], correct_answer เป็นคำตอบสั้นๆ`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing authorization" }, 401);

  // verify-jwt (default on) already rejected anything without a valid user
  // JWT before this code runs — this client is just to fail closed if that
  // ever changes, not to do the auth check ourselves.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

  let body: { messages?: { role: "user" | "assistant"; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return json({ error: "messages required" }, 400);

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) return json({ error: "GROQ_API_KEY not configured" }, 500);

  const groqRes = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!groqRes.ok) return json({ error: `groq error: ${await groqRes.text()}` }, 502);

  const completion = await groqRes.json();
  const content = completion.choices?.[0]?.message?.content;
  if (!content) return json({ error: "empty completion" }, 502);

  let parsed: { reply?: string; done?: boolean; question?: GeneratedQuestion | null };
  try {
    parsed = JSON.parse(content);
  } catch {
    return json({ error: "model did not return valid json" }, 502);
  }
  if (!parsed.reply?.trim()) return json({ error: "model returned no reply" }, 502);

  if (parsed.done && parsed.question) {
    const q = parsed.question;
    const validChoices =
      q.type === "multiple_choice"
        ? q.choices.length >= 2 && q.choices.some((c) => c.is_correct)
        : q.type === "true_false"
          ? q.choices.length === 2
          : true;
    if (!q.prompt?.trim() || !validChoices) return json({ error: "model returned malformed question" }, 502);
  }

  return json({ reply: parsed.reply, done: !!parsed.done, question: parsed.done ? (parsed.question ?? null) : null });
});
