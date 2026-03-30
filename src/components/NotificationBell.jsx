import { useState, useRef, useEffect } from "react";
import { Bell, Check, X } from "lucide-react";
import { useNotifications } from "../lib/useSupabase";

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllRead, dismiss } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-white/[0.04]"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-[#00F0B5] text-[#020617] text-[10px] font-bold rounded-full shadow-[0_0_6px_rgba(0,240,181,0.3)]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[420px] glass-card rounded-2xl shadow-2xl overflow-hidden z-50 border border-white/[0.06]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.04]">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[#00F0B5] hover:text-[#00dba5] font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[360px]">
            {notifications.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-5 h-5 text-gray-600" />
                </div>
                <p className="text-gray-500 text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${
                    !n.is_read ? "bg-[#00F0B5]/[0.03]" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {n.alert?.title || "New gig alert"}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      r/{n.alert?.subreddit} •{" "}
                      {new Date(n.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!n.is_read && (
                      <button
                        onClick={() => markAsRead(n.id)}
                        className="p-1 text-gray-600 hover:text-[#00F0B5] transition-colors"
                        title="Mark read"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => dismiss(n.id)}
                      className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
