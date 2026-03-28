import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Zap,
  LayoutDashboard,
  Bell,
  FileText,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import NotificationBell from "./NotificationBell";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/gig-alerts", label: "Gig Alerts", icon: Bell },
  { to: "/proposals", label: "Proposals", icon: FileText },
  { to: "/profile", label: "My Profile", icon: User },
];

export default function Navbar() {
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleSignOut() {
    signOut();
    navigate("/");
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-[#0B1120] border-b border-white/5 flex items-center justify-between px-4">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-lg font-bold text-white"
        >
          <Zap className="w-5 h-5 text-[#00F0B5]" />
          <span>
            GigAlert<span className="text-[#00F0B5]">Pro</span>
          </span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-gray-400 hover:text-white"
        >
          {mobileOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen w-60 bg-[#0B1120] border-r border-white/5 flex flex-col transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#00F0B5]/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-[#00F0B5]" />
          </div>
          <Link
            to="/dashboard"
            className="text-lg font-bold text-white tracking-tight"
          >
            GigAlert<span className="text-[#00F0B5]">Pro</span>
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative
                  ${
                    active
                      ? "bg-[#00F0B5]/10 text-[#00F0B5]"
                      : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                  }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#00F0B5] rounded-r-full" />
                )}
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Notifications + Sign Out */}
        <div className="px-3 py-4 border-t border-white/5 shrink-0 space-y-2">
          <div className="flex items-center gap-3 px-3 py-1">
            <NotificationBell />
            <span className="text-sm text-gray-400">Alerts</span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
