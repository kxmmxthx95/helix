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

// Tables that FK to profiles with ON DELETE RESTRICT; any row blocks the delete.
const BLOCKERS: [table: string, columns: string[], label: string][] = [
  ["classroom_homeroom_teachers", ["teacher_id"], "ครูประจำชั้น"],
  ["teaching_assignments", ["teacher_id"], "ภาระการสอน"],
  ["exam_sessions", ["teacher_id"], "รอบสอบ"],
  ["exam_questions", ["created_by"], "ข้อสอบ"],
  ["practice_sets", ["created_by"], "ชุดฝึกหัด"],
  ["leave_requests", ["profile_id"], "คำขอลา"],
  ["student_leave_requests", ["submitted_by"], "คำขอลาของนักเรียน"],
  ["attendance_records", ["recorded_by"], "บันทึกเช็กชื่อ"],
  ["period_attendance_records", ["recorded_by"], "บันทึกเช็กชื่อรายคาบ"],
  ["behavior_records", ["recorded_by"], "บันทึกพฤติกรรม"],
  ["time_clock_records", ["profile_id", "recorded_by"], "บันทึกเวลาเข้า-ออก"],
  ["premises_exit_requests", ["profile_id"], "คำขอออกนอกสถานที่"],
  ["employee_status_history", ["changed_by"], "ประวัติสถานะบุคลากร"],
  ["documents", ["uploaded_by"], "เอกสาร"],
  ["duty_assignments", ["staff_id", "created_by"], "เวร"],
  ["duty_transfer_requests", ["requester_id", "target_staff_id"], "คำขอแลกเวร"],
  ["duty_points", ["fixed_staff_id"], "จุดเวร"],
  ["duty_weekly_template", ["staff_id", "created_by"], "แม่แบบเวรรายสัปดาห์"],
];

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
  if (error) {
    const found: string[] = [];
    for (const [table, columns, label] of BLOCKERS) {
      for (const col of columns) {
        const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq(col, userId);
        if (count) {
          found.push(`${label} ${count} รายการ`);
          break;
        }
      }
    }
    if (found.length > 0) {
      return json({ error: `ลบไม่ได้ เพราะผู้ใช้ยังมีข้อมูลผูกอยู่: ${found.join(", ")} — ย้ายหรือลบข้อมูลเหล่านี้ก่อน` }, 400);
    }
    return json({ error: error.message }, 400);
  }

  return json({ ok: true });
});
