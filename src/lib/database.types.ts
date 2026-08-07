import type { Role } from "@/lib/roles";

export type StudentStatus = "studying" | "transferred" | "graduated" | "dropped";

export type Department = {
  id: string;
  code: string;
  name: string;
  created_at: string;
};

export type Profile = {
  id: string;
  role: Role;
  department_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  line_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Student = {
  id: string;
  student_code: string;
  national_id: string | null;
  first_name: string;
  last_name: string;
  department_id: string;
  class_level: string | null;
  status: StudentStatus;
  profile_id: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  created_at: string;
  updated_at: string;
};

type Table<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

/** Columns the database fills in itself are never required on insert. */
type Generated = "id" | "created_at" | "updated_at";

/** Nullable and defaulted columns are optional on insert; the rest are not. */
type InsertOf<Row, Optional extends keyof Row> = Omit<Row, Generated | Optional> &
  Partial<Pick<Row, Extract<Optional, keyof Row>>>;

/**
 * Hand-written until the schema settles. Regenerate with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 */
export type Database = {
  public: {
    Tables: {
      departments: Table<Department, InsertOf<Department, never>>;
      // profiles.id is the auth.users id, so it is supplied, not generated.
      profiles: Table<
        Profile,
        Omit<Profile, "created_at" | "updated_at" | "department_id" | "email" | "phone" | "line_user_id" | "is_active"> &
          Partial<Pick<Profile, "department_id" | "email" | "phone" | "line_user_id" | "is_active">>
      >;
      students: Table<
        Student,
        InsertOf<
          Student,
          | "status"
          | "profile_id"
          | "national_id"
          | "class_level"
          | "guardian_name"
          | "guardian_phone"
        >
      >;
      guardianships: Table<{ parent_id: string; student_id: string }>;
      audit_logs: Table<{
        id: number;
        actor_id: string | null;
        actor_role: Role;
        action: string;
        table_name: string;
        record_id: string;
        changes: unknown;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { app_role: Role; student_status: StudentStatus };
    CompositeTypes: Record<string, never>;
  };
};
