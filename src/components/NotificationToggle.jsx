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
    <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              enabled
                ? "bg-[#00F0B5]/10"
                : denied
                  ? "bg-red-500/10"
                  : "bg-gray-500/10"
            }`}
          >
            {enabled ? (
              <BellRing className="w-5 h-5 text-[#00F0B5]" />
            ) : denied ? (
              <BellOff className="w-5 h-5 text-red-400" />
            ) : (
              <Bell className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">
              Push Notifications
            </h3>
            <p className="text-gray-400 text-xs mt-0.5">
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
          className={`relative w-12 h-7 rounded-full transition-colors ${
            denied
              ? "bg-gray-700 cursor-not-allowed opacity-50"
              : enabled
                ? "bg-[#00F0B5]"
                : "bg-gray-600 hover:bg-gray-500"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
