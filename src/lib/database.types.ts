import type { Role } from "@/lib/roles";

export type StudentStatus = "studying" | "transferred" | "graduated" | "dropped";

export type Department = {
  id: string;
  code: string;
  name: string;
  created_at: string;
};

export type PositionTitle = {
  id: string;
  code: string;
  name: string;
  created_at: string;
};

export type Profile = {
  id: string;
  department_id: string | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  email: string | null; // contact only — never the login identity
  phone: string | null; // also the login id for non-student roles
  national_id: string | null;
  date_of_birth: string | null;
  line_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const profileFullName = (p: Pick<Profile, "prefix" | "first_name" | "last_name">) =>
  `${p.prefix ?? ""}${p.first_name} ${p.last_name}`.trim();

/** Singleton row (id is always 1) — header branding, shown app-wide. */
export type SchoolSettings = {
  id: 1;
  name_th: string;
  name_en: string | null;
  logo_path: string | null; // object path in the school-assets storage bucket
  academic_year: number; // พ.ศ.
  updated_at: string;
};

/** One row per department, always present — see migration 0002 seed trigger. */
export type DepartmentSettings = {
  department_id: string;
  semester1_start: string | null;
  semester1_end: string | null;
  semester2_start: string | null;
  semester2_end: string | null;
  updated_at: string;
};

export type ProfileRole = {
  id: string;
  profile_id: string;
  role: Role;
  position_title_id: string | null;
  created_at: string;
};

/** A profile plus the role names it holds — enough for every permission check. */
export type ProfileWithRoles = Profile & { roles: Role[] };

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
      position_titles: Table<PositionTitle, InsertOf<PositionTitle, never>>;
      // profiles.id is the auth.users id, so it is supplied, not generated.
      profiles: Table<
        Profile,
        Omit<
          Profile,
          | "created_at"
          | "updated_at"
          | "department_id"
          | "prefix"
          | "email"
          | "phone"
          | "national_id"
          | "date_of_birth"
          | "line_user_id"
          | "is_active"
        > &
          Partial<
            Pick<
              Profile,
              | "department_id"
              | "prefix"
              | "email"
              | "phone"
              | "national_id"
              | "date_of_birth"
              | "line_user_id"
              | "is_active"
            >
          >
      >;
      profile_roles: Table<ProfileRole, InsertOf<ProfileRole, "position_title_id">>;
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
      school_settings: Table<SchoolSettings>;
      department_settings: Table<DepartmentSettings>;
      audit_logs: Table<{
        id: number;
        actor_id: string | null;
        actor_roles: Role[];
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
