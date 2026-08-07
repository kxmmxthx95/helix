/**
 * Client-side mirror of the role rules enforced in RLS
 * (supabase/migrations/0001_init.sql). This exists to hide UI the user can't
 * use — it is never the security boundary. The database is.
 *
 * A profile can hold several roles at once (many-to-many, see profile_roles)
 * — every check here takes the full array a person holds, not one role.
 */

export const ROLES = [
  "super_admin",
  "director",
  "staff",
  "dept_head",
  "teacher",
  "student",
  "parent",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "ผู้ดูแลระบบสูงสุด",
  director: "ผู้บริหารสูงสุด",
  staff: "ธุรการ",
  dept_head: "ผู้บริหารแผนก",
  teacher: "ครูผู้สอน",
  student: "นักเรียน",
  parent: "ผู้ปกครอง",
};

/** "หัวหน้าฝ่ายวิชาการ" etc. — a dept_head instance's job title, not a role. */
export const roleLabels = (roles: Role[]): string =>
  roles.length ? roles.map((r) => ROLE_LABEL[r]).join(", ") : "—";

export const PREFIXES = ["นาย", "นาง", "นางสาว", "ดร."];

const ORG_WIDE: readonly Role[] = ["super_admin", "director", "staff"];
const MANAGERS: readonly Role[] = ["super_admin", "director", "staff", "dept_head"];
/** Roles whose actions land in audit_logs — students and parents are excluded. */
const AUDITED: readonly Role[] = ["super_admin", "director", "dept_head", "teacher", "staff"];

/** Sees every department, not just their own. */
export const isOrgWide = (roles: Role[]) => roles.some((r) => ORG_WIDE.includes(r));

/** May create/edit roster rows within their scope. Does NOT cover user accounts. */
export const canManage = (roles: Role[]) => roles.some((r) => MANAGERS.includes(r));

/** May open the user-management screen and create/edit accounts — super_admin only (grill decision). */
export const canManageUsers = (roles: Role[]) => roles.includes("super_admin");

/** May see the audit trail. */
export const canViewAudit = canManage;

export const isAudited = (roles: Role[]) => roles.some((r) => AUDITED.includes(r));

/** True only if every role held is self-scoped — sees just their own record / their own children. */
export const isSelfScoped = (roles: Role[]) =>
  roles.length > 0 && roles.every((r) => r === "student" || r === "parent");
