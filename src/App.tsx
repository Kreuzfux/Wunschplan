import { Navigate, Route, Routes, HashRouter } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { EmployeeDashboardPage } from "@/pages/EmployeeDashboardPage";
import { AdminDashboardPage } from "@/pages/AdminDashboardPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ChatPage } from "@/pages/ChatPage";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-6">Lade Benutzer...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { profile, loading } = useAuth();
  if (loading) return <div className="p-6">Lade Profil...</div>;
  if (!profile || !["admin", "superuser"].includes(profile.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function HomeRoute() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="p-6">Lade Benutzer...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (profile && ["admin", "superuser"].includes(profile.role)) return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <EmployeeDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminDashboardPage />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profil"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<HomeRoute />} />
      </Routes>
    </HashRouter>
  );
}
