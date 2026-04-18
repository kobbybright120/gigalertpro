import { useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import {
  isNotificationSupported,
  isEnabled,
  getPermission,
  requestPermission,
  disableNotifications,
  enableNotifications,
} from "../lib/gigNotifications";

export default function NotificationToggle() {
  const supported = isNotificationSupported();
  const [enabled, setEnabled] = useState(() => isEnabled());
  const [permission, setPermission] = useState(() => getPermission());

  async function handleToggle() {
    if (enabled) {
      disableNotifications();
      setEnabled(false);
    } else {
      if (permission === "granted") {
        enableNotifications();
        setEnabled(true);
      } else {
        const granted = await requestPermission();
        setPermission(getPermission());
        setEnabled(granted);
      }
    }
  }

  if (!supported) return null;

  const denied = permission === "denied";

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              enabled
                ? "bg-[#00F0B5]/[0.08]"
                : denied
                  ? "bg-red-500/[0.08]"
                  : "bg-white/[0.04]"
            }`}
          >
            {enabled ? (
              <BellRing className="w-5 h-5 text-[#00F0B5]" />
            ) : denied ? (
              <BellOff className="w-5 h-5 text-red-400" />
            ) : (
              <Bell className="w-5 h-5 text-gray-500" />
            )}
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">
              Push Notifications
            </h3>
            <p className="text-gray-500 text-xs mt-0.5">
              {denied
                ? "Blocked by browser — allow in site settings"
                : enabled
                  ? "You'll get notified when new gigs arrive"
                  : "Get alerted instantly when new gigs match"}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={denied}
          className={`relative w-12 h-7 rounded-full transition-all duration-300 ${
            denied
              ? "bg-gray-700/50 cursor-not-allowed opacity-50"
              : enabled
                ? "bg-[#00F0B5] shadow-[0_0_10px_rgba(0,240,181,0.2)]"
                : "bg-white/[0.08] hover:bg-white/[0.12]"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-300 ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
