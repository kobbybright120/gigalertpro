import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../lib/useSupabase";
import {
  LayoutDashboard,
  Bell,
  FileText,
  User,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import NotificationBell from "./NotificationBell";
import { useNewGigCount } from "../context/NewGigCountContext";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/gig-alerts", label: "Gig Alerts", icon: Bell },
  { to: "/proposals", label: "Proposals", icon: FileText },
  { to: "/profile", label: "My Profile", icon: User },
];

export default function Navbar() {
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { count: newGigCount, reset: resetGigCount } = useNewGigCount();

  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = (() => {
    const name = profile?.name || user?.email || "U";
    const parts = (name || "").split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-[#0B1120]/80 backdrop-blur-xl border-b border-white/[0.04] flex items-center justify-between px-4">
        <Link
          to="/dashboard"
          className="flex items-center gap-1 text-lg font-bold text-white"
        >
          <div className="w-8 h-8 flex items-center justify-center">
            <img
              src="/GigAlertIcon.png?v=20260403"
              alt="GigAlertPro"
              className="w-full h-full object-contain transform scale-100 origin-center"
            />
            <span>
              GigAlert<span className="text-gradient">Pro</span>
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <NotificationBell />
          {user && (
            <Link
              to="/profile"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="w-8 h-8 rounded-full object-cover border-2 border-[#00F0B5]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00F0B5] to-[#00D4FF] flex items-center justify-center text-[#020617] font-bold text-sm">
                  {initials}
                </div>
              )}
            </Link>
          )}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            {mobileOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen w-60 bg-[#0B1120]/95 backdrop-blur-xl border-r border-white/[0.04] flex flex-col transition-transform duration-300 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-1 px-4 border-b border-white/[0.04] shrink-0">
          <div className="w-10 h-10 flex items-center justify-center">
            <img
              src="/GigAlertIcon.png?v=20260403"
              alt="GigAlertPro"
              className="w-full h-full object-contain transform scale-125 origin-center"
            />
          </div>
          <Link
            to="/dashboard"
            className="text-lg font-bold text-white tracking-tight"
          >
            GigAlert<span className="text-gradient">Pro</span>
          </Link>
        </div>

        {/* Nav section label */}
        <div className="px-5 pt-6 pb-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em]">
            Menu
          </p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            const isGigAlerts = to === "/gig-alerts";
            return (
              <Link
                key={to}
                to={to}
                onClick={() => {
                  setMobileOpen(false);
                  if (isGigAlerts) resetGigCount();
                }}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative
                  ${
                    active
                      ? "bg-[#00F0B5]/[0.08] text-[#00F0B5] shadow-[inset_0_0_0_1px_rgba(0,240,181,0.1)]"
                      : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
                  }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#00F0B5] rounded-r-full shadow-[0_0_8px_rgba(0,240,181,0.4)]" />
                )}
                <Icon
                  className={`w-[18px] h-[18px] ${active ? "text-[#00F0B5]" : "text-gray-500 group-hover:text-gray-300"} transition-colors`}
                />
                <span className="flex-1">{label}</span>
                {isGigAlerts && newGigCount > 0 && (
                  <span className="min-w-5 h-5 flex items-center justify-center px-1.5 rounded-full bg-[#00F0B5] text-[#020617] text-[10px] font-bold shadow-[0_0_8px_rgba(0,240,181,0.3)] animate-pulse">
                    {newGigCount > 99 ? "99+" : newGigCount}
                  </span>
                )}
                {!isGigAlerts && active && (
                  <ChevronRight className="w-3.5 h-3.5 text-[#00F0B5]/40" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-3 py-4 border-t border-white/[0.04] shrink-0 space-y-2">
          <Link
            to="/profile"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.02] transition-colors"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                className="w-9 h-9 rounded-full object-cover border-2 border-[#00F0B5]"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00F0B5] to-[#00D4FF] flex items-center justify-center text-[#020617] font-bold text-sm">
                {initials}
              </div>
            )}
            <div className="flex-1 text-left overflow-hidden">
              <div className="text-sm font-medium text-white truncate">
                {profile?.name || (user?.email || "User").split("@")[0]}
              </div>
              <div className="text-xs text-gray-400 truncate">
                {user?.email || ""}
              </div>
            </div>
          </Link>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-500/[0.06] hover:text-red-400 transition-all duration-200 w-full"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
