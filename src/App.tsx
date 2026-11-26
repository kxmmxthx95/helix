import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/AppShell";
const GameHud = lazy(() => import("@/components/game/GameHud").then((m) => ({ default: m.GameHud })));
const GameShell = lazy(() => import("@/components/game/GameShell").then((m) => ({ default: m.GameShell })));
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { Spinner } from "@/components/ui";
const Assignments = lazy(() => import("@/routes/Assignments").then((m) => ({ default: m.Assignments })));
const Attendance = lazy(() => import("@/routes/Attendance").then((m) => ({ default: m.Attendance })));
const BehaviorScore = lazy(() => import("@/routes/BehaviorScore").then((m) => ({ default: m.BehaviorScore })));
const ExamBank = lazy(() => import("@/routes/ExamBank").then((m) => ({ default: m.ExamBank })));
const Documents = lazy(() => import("@/routes/Documents").then((m) => ({ default: m.Documents })));
const Exams = lazy(() => import("@/routes/Exams").then((m) => ({ default: m.Exams })));
const ExamPractice = lazy(() => import("@/routes/Exams").then((m) => ({ default: m.ExamPractice })));
const Practice = lazy(() => import("@/routes/Practice").then((m) => ({ default: m.Practice })));
const ScoreRecording = lazy(() => import("@/routes/ScoreRecording").then((m) => ({ default: m.ScoreRecording })));
const Profile = lazy(() => import("@/routes/Profile").then((m) => ({ default: m.Profile })));
const Dashboard = lazy(() => import("@/routes/Dashboard").then((m) => ({ default: m.Dashboard })));
import { Login } from "@/routes/Login";
const StudentLogin = lazy(() => import("@/routes/StudentLogin").then((m) => ({ default: m.StudentLogin })));
const Onboarding = lazy(() => import("@/routes/Onboarding").then((m) => ({ default: m.Onboarding })));
const Classrooms = lazy(() => import("@/routes/Classrooms").then((m) => ({ default: m.Classrooms })));
const Curriculum = lazy(() => import("@/routes/Curriculum").then((m) => ({ default: m.Curriculum })));
const CurriculumMap = lazy(() => import("@/routes/CurriculumMap").then((m) => ({ default: m.CurriculumMap })));
const MyCurriculum = lazy(() => import("@/routes/MyCurriculum").then((m) => ({ default: m.MyCurriculum })));
const StudyMap = lazy(() => import("@/routes/StudyMap").then((m) => ({ default: m.StudyMap })));
const Employees = lazy(() => import("@/routes/Employees").then((m) => ({ default: m.Employees })));
const Enrollment = lazy(() => import("@/routes/Enrollment").then((m) => ({ default: m.Enrollment })));
const Roster = lazy(() => import("@/routes/Roster").then((m) => ({ default: m.Roster })));
const Settings = lazy(() => import("@/routes/Settings").then((m) => ({ default: m.Settings })));
const AcademicEvents = lazy(() => import("@/routes/AcademicEvents").then((m) => ({ default: m.AcademicEvents })));
const StatusManagement = lazy(() => import("@/routes/StatusManagement").then((m) => ({ default: m.StatusManagement })));
const Subjects = lazy(() => import("@/routes/Subjects").then((m) => ({ default: m.Subjects })));
const TeachingLoad = lazy(() => import("@/routes/TeachingLoad").then((m) => ({ default: m.TeachingLoad })));
const TeachingPlan = lazy(() => import("@/routes/TeachingPlan").then((m) => ({ default: m.TeachingPlan })));
const TeachingPlanCalendar = lazy(() => import("@/routes/TeachingPlanCalendar").then((m) => ({ default: m.TeachingPlanCalendar })));
const Timetable = lazy(() => import("@/routes/Timetable").then((m) => ({ default: m.Timetable })));
const TimeTracking = lazy(() => import("@/routes/TimeTracking").then((m) => ({ default: m.TimeTracking })));
import { canUsePos, isCashierOnly } from "@/lib/roles";
import { PosLogin, POS_DENIED_KEY } from "@/routes/PosLogin";
import { CardTopup } from "@/routes/CardTopup";
const CardTopupForm = lazy(() => import("@/routes/CardTopupForm").then((m) => ({ default: m.CardTopupForm })));
const StudentCards = lazy(() => import("@/routes/StudentCards").then((m) => ({ default: m.StudentCards })));
const Tuition = lazy(() => import("@/routes/Tuition").then((m) => ({ default: m.Tuition })));
const Leave = lazy(() => import("@/routes/Leave").then((m) => ({ default: m.Leave })));
const SubjectCovers = lazy(() => import("@/routes/SubjectCovers").then((m) => ({ default: m.SubjectCovers })));
const LineNotifications = lazy(() => import("@/routes/LineNotifications").then((m) => ({ default: m.LineNotifications })));
const DutyRoster = lazy(() => import("@/routes/DutyRoster").then((m) => ({ default: m.DutyRoster })));
const PeriodAttendance = lazy(() => import("@/routes/PeriodAttendance").then((m) => ({ default: m.PeriodAttendance })));
const Users = lazy(() => import("@/routes/Users").then((m) => ({ default: m.Users })));

/** A signed-in account without POS access landed on /pos-login: sign out and let PosLogin show a neutral error. */
function PosDenied() {
  const { signOut } = useAuth();
  useEffect(() => {
    try {
      sessionStorage.setItem(POS_DENIED_KEY, "1");
    } catch {
      /* ignore private mode */
    }
    void signOut();
  }, [signOut]);
  return null;
}

function Gate() {
  const { session, profile, loading, onboardingStep, onboardingLoading } = useAuth();
  const location = useLocation();

  if (loading || (session && !profile) || (session && onboardingLoading)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    if (location.pathname === "/student-login") return <StudentLogin />;
    if (location.pathname === "/pos-login") return <PosLogin />;
    // Logging out of the POS lands back on its own sign-in, not the shared one.
    if (location.pathname.startsWith("/card-topup")) return <Navigate to="/pos-login" replace />;
    return <Login />;
  }

  if (location.pathname === "/pos-login") {
    return profile && canUsePos(profile.roles) ? <Navigate to="/card-topup" replace /> : <PosDenied />;
  }

  // Blocks the whole menu until the student's required data is filled in and
  // their password changed — regardless of which path they're on. See
  // migration 0022 / src/lib/onboarding.ts.
  if (onboardingStep) return <Onboarding step={onboardingStep} />;

  const isStudent = profile?.roles.includes("student") ?? false;

  return (
    <Routes>
      <Route element={isStudent ? <GameShell /> : <AppShell />}>
        <Route index element={isStudent ? <GameHud /> : isCashierOnly(profile?.roles ?? []) ? <Navigate to="/card-topup" replace /> : <Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="roster" element={<Roster />} />
        <Route path="classrooms" element={<Classrooms />} />
        <Route path="score-recording" element={<ScoreRecording />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="exam-bank" element={<ExamBank />} />
        <Route path="exams" element={<Exams />} />
        <Route path="exams/practice/:sessionId" element={<ExamPractice />} />
        <Route path="practice" element={<Practice />} />
        <Route path="documents" element={<Documents />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="period-attendance" element={<PeriodAttendance />} />
        <Route path="behavior" element={<BehaviorScore />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="curriculum" element={<Curriculum />} />
        <Route path="curriculum-map" element={<CurriculumMap />} />
        <Route path="map" element={<StudyMap />} />
        <Route path="my-curriculum" element={<MyCurriculum />} />
        <Route path="enrollment" element={<Enrollment />} />
        <Route path="teaching-load" element={<TeachingLoad />} />
        <Route path="teaching-plan" element={<TeachingPlan />} />
        <Route path="teaching-plan/:assignmentId" element={<TeachingPlanCalendar />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="academic-events" element={<AcademicEvents />} />
        <Route path="time-tracking" element={<TimeTracking />} />
        <Route path="leave" element={<Leave />} />
        <Route path="tuition" element={<Tuition />} />
        <Route path="card-topup" element={<CardTopup />} />
        <Route path="card-topup/:studentId" element={<CardTopupForm />} />
        <Route path="student-cards" element={<StudentCards />} />
        <Route path="duty-roster" element={<DutyRoster />} />
        <Route path="employees" element={<Employees />} />
        <Route path="staff-attendance" element={<Navigate to="/time-tracking?tab=report" replace />} />
        <Route path="status" element={<StatusManagement />} />
        <Route path="settings" element={<Settings />} />
        <Route path="subject-covers" element={<SubjectCovers />} />
        <Route path="line-notifications" element={<LineNotifications />} />
        <Route path="profile" element={<Profile />} />
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
            <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center"><Spinner className="h-5 w-5 text-muted-foreground" /></div>}>
              <Gate />
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
