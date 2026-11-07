import { normalizeNationalId } from "@/lib/nationalId";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ProfileWithRoles, Student } from "@/lib/database.types";
import { missingOnboardingStep, type OnboardingStep } from "@/lib/onboarding";
import type { Role } from "@/lib/roles";
import { supabase } from "@/lib/supabase";

/** Auto sign-out after this much inactivity. Tune here, nowhere else. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** >0 while a screen (an exam attempt) has asked to pause idle sign-out. */
let idlePauses = 0;

/** Pauses the idle sign-out while the calling component is mounted — an exam has its own clock + heartbeat. */
export function usePauseIdleSignOut() {
  useEffect(() => {
    idlePauses++;
    return () => {
      idlePauses--;
    };
  }, []);
}

/**
 * super_admin-only nav/UI preview (grill-lite decision, 2026-08-12): swaps
 * profile.roles client-side so every existing canManage()/isOrgWide()/role
 * check throughout the app renders as that role would see it — a real
 * super_admin session still backs every Supabase query, so RLS keeps
 * granting org-wide DATA access underneath. This previews menus/routes, not
 * a real "log in as" — never touches auth, never scopes queries down.
 * sessionStorage (not localStorage) so it can't silently outlive the tab.
 */
const VIEW_AS_KEY = "helix-view-as-role";

type AuthState = {
  session: Session | null;
  profile: ProfileWithRoles | null;
  loading: boolean;
  /** The signed-in student's own roster row — null for staff/director/etc. */
  myStudent: Student | null;
  /** Non-null while a student still has required onboarding left — see migration 0022. */
  onboardingStep: OnboardingStep | null;
  /** True while onboardingStep is still being computed — Gate() should keep showing the spinner. */
  onboardingLoading: boolean;
  /** Re-fetches myStudent/onboardingStep — call after each onboarding step saves. */
  refreshOnboarding: () => Promise<void>;
  /** Re-fetches the profile row (e.g. after an avatar upload) — roles are left untouched. */
  refreshProfile: () => Promise<void>;
  /** The signed-in account's real roles — never swapped by viewAsRole, unlike profile.roles. */
  actualRoles: Role[];
  /** Non-null while a super_admin is previewing another role's nav/routes. See VIEW_AS_KEY above. */
  viewAsRole: Role | null;
  /** No-ops for anyone whose actualRoles doesn't include super_admin. */
  setViewAsRole: (role: Role | null) => void;
  /** loginId is a student_code or a phone number — never a real email. */
  signIn: (loginId: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Self-service recovery via the reset-password Edge Function — no inbox involved. */
  resetPassword: (
    loginId: string,
    nationalId: string,
    dateOfBirth: string,
    newPassword: string,
  ) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** sessionStorage flag: login pages show "บัญชีถูกระงับ" once after a forced sign-out. */
export const SUSPENDED_KEY = "helix.suspended";

/** Peeks the flag (idempotent, StrictMode-safe) — login pages use it as the initial error and call clearSuspendedNotice on mount. */
export function takeSuspendedNotice(): string | undefined {
  try {
    return sessionStorage.getItem(SUSPENDED_KEY) ? "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" : undefined;
  } catch {
    return undefined;
  }
}

export function clearSuspendedNotice() {
  try {
    sessionStorage.removeItem(SUSPENDED_KEY);
  } catch {
    /* ignore private mode */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileWithRoles | null>(null);
  const [loading, setLoading] = useState(true);
  const [myStudent, setMyStudent] = useState<Student | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [viewAsRole, setViewAsRoleState] = useState<Role | null>(() => {
    try {
      return (sessionStorage.getItem(VIEW_AS_KEY) as Role | null) ?? null;
    } catch {
      return null;
    }
  });

  const signOut = useCallback(async () => {
    const wasStudent = profile?.roles.includes("student") ?? false;
    await supabase.auth.signOut();
    setProfile(null);
    setMyStudent(null);
    setOnboardingStep(null);
    try {
      sessionStorage.removeItem(VIEW_AS_KEY);
    } catch {
      /* ignore private mode */
    }
    setViewAsRoleState(null);
    // Gate renders StudentLogin only on this path; students must land there.
    if (wasStudent) window.location.replace("/student-login");
  }, [profile]);

  const setViewAsRole = useCallback(
    (role: Role | null) => {
      if (!profile?.roles.includes("super_admin")) return;
      try {
        if (role) sessionStorage.setItem(VIEW_AS_KEY, role);
        else sessionStorage.removeItem(VIEW_AS_KEY);
      } catch {
        /* ignore quota / private mode */
      }
      setViewAsRoleState(role);
    },
    [profile],
  );

  // Only takes effect for an actual super_admin — a stale sessionStorage
  // value left over from a different account on the same tab is inert here.
  const effectiveProfile = useMemo(() => {
    if (!profile) return null;
    if (viewAsRole && profile.roles.includes("super_admin")) return { ...profile, roles: [viewAsRole] };
    return profile;
  }, [profile, viewAsRole]);

  // Session bootstrap + subscription.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setProfile(null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Onboarding gate (migration 0022): must_change_password alone blocks any
  // role (grill decision — auto-generated passwords force a change everywhere,
  // not just students). The rest of the stepper (roster row + guardian count)
  // only applies to students. Runs after every profile (re)fetch.
  const loadOnboarding = useCallback(async (p: ProfileWithRoles) => {
    setOnboardingLoading(true);
    try {
      if (!p.roles.includes("student")) {
        setMyStudent(null);
        setOnboardingStep(missingOnboardingStep(p.must_change_password, null, 0));
        return;
      }
      const { data: student } = await supabase
        .from("students")
        .select("*")
        .eq("profile_id", p.id)
        .maybeSingle();
      setMyStudent(student ?? null);

      let guardianCount = 0;
      if (student) {
        const { count } = await supabase
          .from("student_contacts")
          .select("id", { count: "exact", head: true })
          .eq("student_id", student.id);
        guardianCount = count ?? 0;
      }
      setOnboardingStep(missingOnboardingStep(p.must_change_password, student ?? null, guardianCount));
    } finally {
      setOnboardingLoading(false);
    }
  }, []);

  // Profile carries roles + department — every permission check needs it.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    // Two plain queries rather than one embedded select — the hand-written
    // Database type doesn't model Relationships, so embeds type as `never`.
    Promise.all([
      supabase.from("profiles").select("*").eq("id", session.user.id).single(),
      supabase.from("profile_roles").select("role").eq("profile_id", session.user.id),
    ]).then(([{ data: p }, { data: pr }]) => {
      if (cancelled || !p) return;
      if (!p.is_active) {
        // Suspended (profiles.is_active = false): no session, back to the right login page.
        const wasStudent = (pr ?? []).some((r) => r.role === "student");
        try {
          sessionStorage.setItem(SUSPENDED_KEY, "1");
        } catch {
          /* ignore private mode */
        }
        void supabase.auth.signOut().then(() => {
          if (wasStudent) window.location.replace("/student-login");
        });
        return;
      }
      const withRoles: ProfileWithRoles = { ...p, roles: (pr ?? []).map((r) => r.role) };
      setProfile(withRoles);
      void loadOnboarding(withRoles);
    });

    return () => {
      cancelled = true;
    };
  }, [session, loadOnboarding]);

  // Idle timeout. Any real interaction restarts the clock.
  useEffect(() => {
    if (!session) return;

    let timer: number;
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (idlePauses > 0) reset();
        else void signOut();
      }, IDLE_TIMEOUT_MS);
    };

    const events = ["pointerdown", "keydown", "visibilitychange"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, signOut]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile: effectiveProfile,
      loading,
      myStudent,
      onboardingStep,
      onboardingLoading,
      actualRoles: profile?.roles ?? [],
      viewAsRole,
      setViewAsRole,
      // Re-fetches the profile row before recomputing — loadOnboarding reads
      // must_change_password off the object passed in, so a stale `profile`
      // (e.g. right after PasswordStep writes the DB directly) would just
      // re-lock the same step instead of advancing.
      refreshOnboarding: async () => {
        if (!session || !profile) return;
        const { data: p } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (!p) return;
        const withRoles: ProfileWithRoles = { ...profile, ...p };
        setProfile(withRoles);
        await loadOnboarding(withRoles);
      },
      refreshProfile: async () => {
        if (!session || !profile) return;
        const { data: p } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (p) setProfile({ ...profile, ...p });
      },
      // Auth identity is a synthetic email under the hood — try student, then
      // staff, then the raw input as a literal email (covers the original
      // super_admin bootstrap account, which was created with a real inbox).
      signIn: async (loginId, password) => {
        const id = loginId.trim();
        const candidates = [
          `${id}@students.helix.internal`,
          `${id}@staff.helix.internal`,
          id,
        ];

        let lastError: Error | null = null;
        for (const email of candidates) {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (!error) {
            // Students: newest login wins, unless a strict exam is live on another session (migration 0132).
            const { data: keep } = await supabase.rpc("keep_other_sessions");
            if (keep === false) await supabase.auth.signOut({ scope: "others" });
            return;
          }
          lastError = error;
        }
        throw lastError;
      },
      signOut,
      resetPassword: async (loginId, nationalId, dateOfBirth, newPassword) => {
        const { error } = await supabase.functions.invoke("reset-password", {
          body: { loginId: loginId.trim(), nationalId: normalizeNationalId(nationalId), dateOfBirth, newPassword },
        });
        if (error) {
          const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
          throw new Error(body?.error ?? "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
        }
      },
    }),
    [
      session,
      effectiveProfile,
      profile,
      loading,
      myStudent,
      onboardingStep,
      onboardingLoading,
      viewAsRole,
      setViewAsRole,
      loadOnboarding,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
