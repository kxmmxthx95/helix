import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Spinner } from "@/components/ui";
import { Dashboard } from "@/routes/Dashboard";
import { Login } from "@/routes/Login";
import { Curriculum } from "@/routes/Curriculum";
import { Enrollment } from "@/routes/Enrollment";
import { Roster } from "@/routes/Roster";
import { Settings } from "@/routes/Settings";
import { AcademicEvents } from "@/routes/AcademicEvents";
import { StatusManagement } from "@/routes/StatusManagement";
import { Subjects } from "@/routes/Subjects";
import { TeachingLoad } from "@/routes/TeachingLoad";
import { Timetable } from "@/routes/Timetable";
import { Users } from "@/routes/Users";

function Gate() {
  const { session, profile, loading } = useAuth();

  if (loading || (session && !profile)) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="roster" element={<Roster />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="curriculum" element={<Curriculum />} />
        <Route path="enrollment" element={<Enrollment />} />
        <Route path="teaching-load" element={<TeachingLoad />} />
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
      <BrowserRouter>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
