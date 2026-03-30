import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NewGigCountProvider } from "./context/NewGigCountContext";

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DISABLE_AUTH =
  import.meta.env.VITE_DISABLE_AUTH === "true" ||
  !VITE_SUPABASE_URL ||
  VITE_SUPABASE_URL.includes("placeholder") ||
  !VITE_SUPABASE_ANON_KEY;
import Navbar from "./components/Navbar";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import GigAlertsPage from "./pages/GigAlertsPage";
import ProposalsPage from "./pages/ProposalsPage";
import ProfilePage from "./pages/ProfilePage";

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-blue border-t-transparent" />
      </div>
    );
  }

  if (!user && !DISABLE_AUTH) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-[#020617]">
      <Navbar />
      {/* Main content offset by sidebar width */}
      <main className="md:ml-60 pt-14 md:pt-0 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}

/* Landing page: only visible to logged-out users */
function PublicLanding() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user || DISABLE_AUTH) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

function AuthGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user || DISABLE_AUTH) return <Navigate to="/dashboard" replace />;
  return <AuthPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NewGigCountProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<PublicLanding />} />
            <Route path="/auth" element={<AuthGuard />} />

            {/* Protected app routes */}
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/gig-alerts" element={<GigAlertsPage />} />
              <Route path="/proposals" element={<ProposalsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NewGigCountProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
