// Synthetic auth-email domains. auth.users.email is never a real inbox here
// — students sign in with student_code, everyone else with phone. Shared
// between invite-user (constructs it) and reset-password (has to guess it).
export const STUDENT_DOMAIN = "students.helix.internal";
export const STAFF_DOMAIN = "staff.helix.internal";

export function syntheticEmail(loginId: string, kind: "student" | "staff"): string {
  return `${loginId}@${kind === "student" ? STUDENT_DOMAIN : STAFF_DOMAIN}`;
}
