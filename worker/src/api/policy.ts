import type { Pred, Sql } from "./compile";

/** Who is asking: derived once per request from profile_roles / profiles / students (what the SQL helpers read via auth.uid()). */
export interface Ctx {
  uid: string;
  roles: Set<string>;
  dept: string | null;
  studentId: string | null;
}

const has = (c: Ctx, ...r: string[]) => r.some((x) => c.roles.has(x));
// Ports of the Postgres helpers (migrations: is_org_wide, can_manage, can_manage_users, is_teacher, is_dept_head).
const orgWide = (c: Ctx) => has(c, "super_admin", "director", "staff");
const canManage = (c: Ctx) => has(c, "super_admin", "director", "staff", "dept_head", "dept_director");
const canManageUsers = (c: Ctx) => has(c, "super_admin");
const isTeacher = (c: Ctx) => has(c, "teacher");
const isStudent = (c: Ctx) => has(c, "student");
const isDeptHead = (c: Ctx) => has(c, "dept_head", "dept_director");

const sql = (s: string, ...params: unknown[]): Sql => ({ sql: s, params });

/** Permissive policies combine with OR (as in Postgres). */
function or(...ps: Pred[]): Pred {
  if (ps.includes(true)) return true;
  const s = ps.filter((p): p is Sql => typeof p !== "boolean");
  return s.length ? { sql: s.map((p) => `(${p.sql})`).join(" OR "), params: s.flatMap((p) => p.params) } : false;
}
function and(...ps: Pred[]): Pred {
  if (ps.includes(false)) return false;
  const s = ps.filter((p): p is Sql => typeof p !== "boolean");
  return s.length ? { sql: s.map((p) => `(${p.sql})`).join(" AND "), params: s.flatMap((p) => p.params) } : true;
}

const inMyDept = (c: Ctx, col: string): Pred => (c.dept ? sql(`${col} = ?`, c.dept) : false);
// Migration 0239: the department-wide clause is for staff; the `student` role only gets its own rows.
const studentsOfMyDept = (c: Ctx): Pred => (c.dept && !isStudent(c) ? sql("student_id IN (SELECT id FROM students WHERE department_id = ?)", c.dept) : false);

/** `cover_sees_student(id)`: I am today's confirmed cover for one of the student's classrooms (today = Asia/Bangkok). */
const coverSeesStudent = (c: Ctx): Pred =>
  sql(
    `EXISTS (SELECT 1 FROM student_classroom_enrollments sce WHERE sce.student_id = students.id AND EXISTS (
       SELECT 1 FROM attendance_covers ac JOIN leave_requests lr ON lr.id = ac.leave_request_id
       LEFT JOIN schedule_entries se ON se.id = ac.schedule_entry_id
       LEFT JOIN teaching_assignments ta ON ta.id = se.teaching_assignment_id
       WHERE ac.cover_staff_id = ? AND ac.status = 'confirmed' AND lr.status = 'approved'
         AND ac.date = date('now', '+7 hours') AND COALESCE(ac.classroom_id, ta.classroom_id) = sce.classroom_id))`,
    c.uid,
  );

type Policy = (c: Ctx) => Pred;

/**
 * SELECT policies, ported from the RLS policies (incl. the `ALL` ones, which also cover SELECT).
 * A table that is not listed here is NOT reachable through the API (deny by default): port its policies, then add it.
 */
const SELECT: Record<string, Policy> = {
  // profiles_manage, profiles_read_scope, profiles_read_self
  profiles: (c) => or(canManageUsers(c), orgWide(c), inMyDept(c, "department_id"), sql("id = ?", c.uid)),

  // profile_roles_manage, _read_scope, _read_dept, _read_self
  profile_roles: (c) =>
    or(
      canManageUsers(c),
      and(
        isTeacher(c) || isDeptHead(c) || orgWide(c),
        orgWide(c) ? true : c.dept ? sql("EXISTS (SELECT 1 FROM profiles p WHERE p.id = profile_roles.profile_id AND p.department_id = ?)", c.dept) : false,
      ),
      sql("profile_id = ?", c.uid),
    ),

  // students_manage, students_read, students_cover_read
  students: (c) =>
    or(
      and(canManage(c), or(orgWide(c), inMyDept(c, "department_id"))),
      orgWide(c),
      isStudent(c) ? false : inMyDept(c, "department_id"),
      sql("profile_id = ?", c.uid),
      sql("EXISTS (SELECT 1 FROM guardianships g WHERE g.student_id = students.id AND g.parent_id = ?)", c.uid),
      coverSeesStudent(c),
    ),

  // student_contacts_manage, _manage_self, _read
  student_contacts: (c) =>
    or(
      and(canManage(c), or(orgWide(c), studentsOfMyDept(c))),
      c.studentId ? sql("student_id = ?", c.studentId) : false,
      orgWide(c),
      studentsOfMyDept(c),
      sql("student_id IN (SELECT student_id FROM guardianships WHERE parent_id = ?)", c.uid),
    ),
};

export const selectPolicy = (table: string): Policy | undefined => SELECT[table];
