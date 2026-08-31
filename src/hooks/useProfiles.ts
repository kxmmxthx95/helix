import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CharacterOptions, Department, PositionTitle, Profile } from "@/lib/database.types";
import type { Role } from "@/lib/roles";
import { supabase } from "@/lib/supabase";

export type ProfileFilters = {
  search: string;
  departmentId: string; // "" = ทุกแผนก
  role: Role | "";
  active: "" | "true" | "false";
};

/** A profile row plus its roles — dept_head can repeat (one per position_title). */
export type ProfileRow = Profile & { roles: Role[]; positionTitleIds: string[] };

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase.from("departments").select("*");
      if (error) throw error;
      // Order: KG (อนุบาล), PRI (ประถม), SEC (มัธยม)
      const order = { KG: 0, PRI: 1, SEC: 2 };
      return (data ?? []).sort((a, b) => (order[a.code as keyof typeof order] ?? 999) - (order[b.code as keyof typeof order] ?? 999));
    },
    staleTime: 60 * 60 * 1000, // Departments change roughly never.
  });
}

export function usePositionTitles() {
  return useQuery({
    queryKey: ["position_titles"],
    queryFn: async (): Promise<PositionTitle[]> => {
      const { data, error } = await supabase.from("position_titles").select("*").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 60 * 1000, // Same as departments — reference data.
  });
}

export function useProfiles(filters: ProfileFilters) {
  return useQuery({
    queryKey: ["profiles", filters],
    queryFn: async (): Promise<ProfileRow[]> => {
      let q = supabase.from("profiles").select("*").order("first_name").order("last_name");

      // RLS already scopes this to the caller's department; these filters
      // only narrow what they are allowed to see, never widen it.
      if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
      if (filters.active) q = q.eq("is_active", filters.active === "true");
      if (filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        q = q.or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`);
      }

      const { data: profiles, error } = await q;
      if (error) throw error;
      if (profiles.length === 0) return [];

      const { data: roleRows, error: rolesError } = await supabase
        .from("profile_roles")
        .select("profile_id, role, position_title_id")
        .in("profile_id", profiles.map((p) => p.id));
      if (rolesError) throw rolesError;

      const byProfile = new Map<string, { roles: Set<Role>; titles: string[] }>();
      for (const r of roleRows ?? []) {
        const entry = byProfile.get(r.profile_id) ?? { roles: new Set<Role>(), titles: [] };
        entry.roles.add(r.role);
        if (r.position_title_id) entry.titles.push(r.position_title_id);
        byProfile.set(r.profile_id, entry);
      }

      const rows = profiles.map((p) => {
        const entry = byProfile.get(p.id);
        return { ...p, roles: entry ? [...entry.roles] : [], positionTitleIds: entry?.titles ?? [] };
      });

      return filters.role ? rows.filter((r) => r.roles.includes(filters.role as Role)) : rows;
    },
    placeholderData: (previous) => previous, // No flash-to-empty while filtering.
  });
}

export type ProfileEdit = Pick<
  Profile,
  | "prefix"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "national_id"
  | "date_of_birth"
  | "department_id"
  | "is_active"
  | "teacher_code"
  | "learning_area_id"
  | "house_no"
  | "village_no"
  | "alley"
  | "road"
  | "subdistrict"
  | "district"
  | "province"
  | "postal_code"
> & {
  /** Roles other than dept_head — dept_head is implied by positionTitleIds. */
  roles: Role[];
  positionTitleIds: string[];
};

type ExistingRole = { id: string; role: Role; position_title_id: string | null };

/**
 * Pure diff between what a profile currently holds in profile_roles and what
 * the edit sheet wants — kept separate from the Supabase calls so the branchy
 * "which rows survive" logic (a security-sensitive role grant/revoke path)
 * has a test that doesn't need a live database.
 */
export function diffProfileRoles(existing: ExistingRole[], wantRoles: Role[], wantTitleIds: string[]) {
  const wantPlain = new Set(wantRoles);
  const wantTitles = new Set(wantTitleIds);
  const havePlain = new Set(existing.filter((r) => r.role !== "dept_head").map((r) => r.role));
  const haveTitles = new Set(
    existing.filter((r) => r.role === "dept_head").map((r) => r.position_title_id),
  );

  const toDeleteIds = existing
    .filter((r) =>
      r.role === "dept_head" ? !wantTitles.has(r.position_title_id!) : !wantPlain.has(r.role),
    )
    .map((r) => r.id);

  const toInsert = [
    ...wantRoles
      .filter((r) => !havePlain.has(r))
      .map((role) => ({ role, position_title_id: null as string | null })),
    ...wantTitleIds
      .filter((t) => !haveTitles.has(t))
      .map((position_title_id) => ({ role: "dept_head" as const, position_title_id })),
  ];

  return { toDeleteIds, toInsert };
}

export function useUpdateProfile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, roles, positionTitleIds, ...patch }: ProfileEdit & { id: string }) => {
      const { error: profileError } = await supabase.from("profiles").update(patch).eq("id", id);
      if (profileError) throw profileError;

      const { data: existing, error: fetchError } = await supabase
        .from("profile_roles")
        .select("id, role, position_title_id")
        .eq("profile_id", id);
      if (fetchError) throw fetchError;

      const { toDeleteIds, toInsert } = diffProfileRoles(existing ?? [], roles, positionTitleIds);

      if (toDeleteIds.length) {
        const { error } = await supabase.from("profile_roles").delete().in("id", toDeleteIds);
        if (error) throw error;
      }
      if (toInsert.length) {
        const { error } = await supabase
          .from("profile_roles")
          .insert(toInsert.map((r) => ({ ...r, profile_id: id })));
        if (error) throw error;
      }
    },
    // ponytail: no optimistic update here — the mutation spans two tables
    // (profiles patch + profile_roles diff), so just refetch on settle.
    onSettled: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

export type MyProfileEdit = Pick<
  Profile,
  | "prefix"
  | "first_name"
  | "last_name"
  | "email"
  | "national_id"
  | "date_of_birth"
  | "house_no"
  | "village_no"
  | "alley"
  | "road"
  | "subdistrict"
  | "district"
  | "province"
  | "postal_code"
>;

/**
 * Self-service edit (โปรไฟล์ของฉัน) — deliberately separate from
 * useUpdateProfile: profiles_update_self RLS lets a signed-in user patch
 * their own row directly, but profile_roles has no self-service write
 * policy at all (role escalation must go through an admin), so this never
 * touches roles/positionTitleIds the way the admin mutation does.
 */
export function useUpdateMyProfile() {
  return useMutation({
    mutationFn: async ({ id, ...patch }: MyProfileEdit & { id: string }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
  });
}

/** Same self-service RLS as useUpdateMyProfile, split out since character_options isn't part of the profile-edit form. */
export function useUpdateCharacterOptions() {
  return useMutation({
    mutationFn: async ({ id, options }: { id: string; options: CharacterOptions }) => {
      const { error } = await supabase.from("profiles").update({ character_options: options }).eq("id", id);
      if (error) throw error;
    },
  });
}

export type UserInvite = {
  kind: "staff" | "student";
  /** student_code (kind="student") or phone (kind="staff") — also the login id. */
  loginId: string;
  password: string;
  /** True when `password` above was auto-derived (DOB/national ID/student code), not typed by the admin — forces a change on first login. */
  mustChangePassword: boolean;
  prefix: string | null;
  first_name: string;
  last_name: string;
  email: string | null; // optional contact email — never the login identity
  national_id: string | null;
  date_of_birth: string | null;
  department_id: string | null;
  roles: Role[]; // ignored for kind="student" (always just "student")
  positionTitleIds: string[]; // ignored for kind="student"
  /** kind="student" only — links students.profile_id to the new account. */
  studentRowId?: string;
  /** roles includes "parent": student ids to link via guardianships (first one's student_code is the default password). */
  guardianStudentIds?: string[];
  /** Base64 (no data-url prefix) of a pre-compressed JPEG — see src/lib/image.ts compressImage/blobToBase64. */
  avatarBase64?: string;
  teacher_code: string | null;
  learning_area_id: string | null; // required when roles includes "teacher"
};

export type InviteOutcome = { inserted: number; skipped: { loginId: string; reason: string }[] };

/**
 * Creating a login account needs the service-role key, which never reaches
 * the browser — this calls the invite-user Edge Function instead, which does
 * the account creation + profile/role insert server-side after re-checking
 * the caller's own permissions itself.
 */
export function useInviteUsers() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (users: UserInvite[]): Promise<InviteOutcome> => {
      const { data, error } = await supabase.functions.invoke("invite-user", { body: { users } });
      if (error) throw error;
      return data as InviteOutcome;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

/** Hard delete via Edge Function — needs service-role to remove auth.users (cascades to profiles). */
export function useDeleteUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", { body: { userId } });
      if (error) throw error;
      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new Error(String(data.error));
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}
