import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ProfileWithRoles, Student } from "@/lib/database.types";
import { missingOnboardingStep, type OnboardingStep } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";

/** Auto sign-out after this much inactivity. Tune here, nowhere else. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileWithRoles | null>(null);
  const [loading, setLoading] = useState(true);
  const [myStudent, setMyStudent] = useState<Student | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setMyStudent(null);
    setOnboardingStep(null);
  }, []);

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
      timer = window.setTimeout(() => void signOut(), IDLE_TIMEOUT_MS);
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
      profile,
      loading,
      myStudent,
      onboardingStep,
      onboardingLoading,
      refreshOnboarding: () => (profile ? loadOnboarding(profile) : Promise.resolve()),
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
          if (!error) return;
          lastError = error;
        }
        throw lastError;
      },
      signOut,
      resetPassword: async (loginId, nationalId, dateOfBirth, newPassword) => {
        const { error } = await supabase.functions.invoke("reset-password", {
          body: { loginId: loginId.trim(), nationalId: nationalId.trim(), dateOfBirth, newPassword },
        });
        if (error) {
          const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
          throw new Error(body?.error ?? "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
        }
      },
    }),
    [session, profile, loading, myStudent, onboardingStep, onboardingLoading, loadOnboarding, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
