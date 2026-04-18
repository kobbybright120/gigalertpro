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
  Lock,
  MessageCircle,
} from "lucide-react";
import NotificationBell from "./NotificationBell";
import { useNewGigCount } from "../context/NewGigCountContext";
import { useLockedDashboard } from "../context/LockedDashboardContext";

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
  const [contactOpen, setContactOpen] = useState(false);
  const { count: newGigCount, reset: resetGigCount } = useNewGigCount();
  const { isLocked, onUpgrade } = useLockedDashboard();

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
          className="flex items-center gap-2.5 text-lg font-bold text-white"
        >
          <img
            src="/logo/icon.svg?v=20260409"
            alt="GigAlertPro"
            className="w-8 h-8 rounded-xl object-cover shadow-[0_0_20px_rgba(0,240,181,0.15)]"
          />
          <span>
            GigAlert<span className="text-gradient">Pro</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {isLocked ? (
            <button
              onClick={onUpgrade}
              className="relative text-gray-500 hover:text-gray-300 transition-colors p-1"
              title="Upgrade to unlock notifications"
            >
              <Bell className="w-5 h-5" />
              <Lock className="w-3 h-3 absolute -bottom-0.5 -right-0.5 text-gray-500" />
            </button>
          ) : (
            <NotificationBell />
          )}
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
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/[0.04] shrink-0">
          <img
            src="/logo/icon.svg?v=20260409"
            alt="GigAlertPro"
            className="w-10 h-10 rounded-xl object-cover shadow-[0_0_20px_rgba(0,240,181,0.15)]"
          />
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

          {/* Contact Us */}
          <button
            onClick={() => {
              setMobileOpen(false);
              setContactOpen(true);
            }}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-200 transition-all duration-200 w-full"
          >
            <MessageCircle className="w-[18px] h-[18px] text-gray-500 group-hover:text-gray-300 transition-colors" />
            <span className="flex-1 text-left">Contact Us</span>
          </button>
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

      {/* Contact Us Modal */}
      {contactOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setContactOpen(false)}
        >
          <div
            className="relative w-full max-w-sm bg-[#0B1120] border border-white/[0.08] rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setContactOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#00F0B5]/10 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-[#00F0B5]" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">
                  Contact Us
                </h2>
                <p className="text-xs text-gray-500">
                  We typically reply within 24 hours
                </p>
              </div>
            </div>

            {/* Email */}
            <a
              href="https://mail.google.com/mail/?view=cm&fs=1&to=support@gigalertpro.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-gray-300 hover:text-[#00F0B5] hover:border-[#00F0B5]/20 transition-all duration-200 mb-3"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-5 h-5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m2 7 10 7 10-7" />
              </svg>
              <div>
                <span className="text-sm font-medium block">
                  support@gigalertpro.com
                </span>
                <span className="text-xs text-gray-500">
                  We typically respond within 24 hours
                </span>
              </div>
            </a>

            {/* LinkedIn */}
            <a
              href="https://www.linkedin.com/in/kobby-bright-35699a2a6"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-gray-300 hover:text-[#00F0B5] hover:border-[#00F0B5]/20 transition-all duration-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="#0A66C2"
                className="w-5 h-5 shrink-0"
              >
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              <span className="text-sm font-medium">LinkedIn</span>
            </a>
          </div>
        </div>
      )}
    </>
  );
}
