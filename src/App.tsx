import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { Attendance } from "@/routes/Attendance";
import { BehaviorScore } from "@/routes/BehaviorScore";
import { Dashboard } from "@/routes/Dashboard";
import { Login } from "@/routes/Login";
import { Onboarding } from "@/routes/Onboarding";
import { Curriculum } from "@/routes/Curriculum";
import { Enrollment } from "@/routes/Enrollment";
import { Roster } from "@/routes/Roster";
import { Settings } from "@/routes/Settings";
import { AcademicEvents } from "@/routes/AcademicEvents";
import { StatusManagement } from "@/routes/StatusManagement";
import { Subjects } from "@/routes/Subjects";
import { TeachingLoad } from "@/routes/TeachingLoad";
import { TeachingPlan } from "@/routes/TeachingPlan";
import { TeachingPlanOverview } from "@/routes/TeachingPlanOverview";
import { Timetable } from "@/routes/Timetable";
import { Users } from "@/routes/Users";

function Gate() {
  const { session, profile, loading, onboardingStep, onboardingLoading } = useAuth();

  if (loading || (session && !profile) || (session && onboardingLoading)) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <Login />;

  // Blocks the whole menu until the student's required data is filled in and
  // their password changed — regardless of which path they're on. See
  // migration 0022 / src/lib/onboarding.ts.
  if (onboardingStep) return <Onboarding step={onboardingStep} />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="roster" element={<Roster />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="behavior" element={<BehaviorScore />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="curriculum" element={<Curriculum />} />
        <Route path="enrollment" element={<Enrollment />} />
        <Route path="teaching-load" element={<TeachingLoad />} />
        <Route path="teaching-plan" element={<TeachingPlan />} />
        <Route path="teaching-plan-overview" element={<TeachingPlanOverview />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="academic-events" element={<AcademicEvents />} />
        <Route path="status" element={<StatusManagement />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
