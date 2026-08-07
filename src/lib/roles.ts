/**
 * Client-side mirror of the role rules enforced in RLS
 * (supabase/migrations/0001_init.sql). This exists to hide UI the user can't
 * use — it is never the security boundary. The database is.
 */

export const ROLES = [
  "super_admin",
  "director",
  "dept_head",
  "academic_head",
  "teacher",
  "staff",
  "student",
  "parent",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "ผู้ดูแลระบบสูงสุด",
  director: "ผู้อำนวยการสูงสุด",
  dept_head: "ผู้อำนวยการแผนก",
  academic_head: "หัวหน้าวิชาการ",
  teacher: "ครูผู้สอน",
  staff: "เจ้าหน้าที่",
  student: "นักเรียน",
  parent: "ผู้ปกครอง",
};

const ORG_WIDE: readonly Role[] = ["super_admin", "director"];
const MANAGERS: readonly Role[] = ["super_admin", "director", "dept_head", "academic_head"];
/** Roles whose actions land in audit_logs — students and parents are excluded. */
const AUDITED: readonly Role[] = ["super_admin", "director", "dept_head", "academic_head", "teacher", "staff"];

/** Sees every department, not just their own. */
export const isOrgWide = (role: Role) => ORG_WIDE.includes(role);

/** May create and edit users and roster rows within their scope. */
export const canManage = (role: Role) => MANAGERS.includes(role);

/** May open the user-management screen. */
export const canManageUsers = (role: Role) => MANAGERS.includes(role);

/** May see the audit trail. */
export const canViewAudit = (role: Role) => MANAGERS.includes(role);

export const isAudited = (role: Role) => AUDITED.includes(role);

/** Roles that only ever see their own record / their own children. */
export const isSelfScoped = (role: Role) => role === "student" || role === "parent";
