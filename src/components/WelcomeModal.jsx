import { useState } from "react";
import {
  Check,
  Square,
  Bell,
  MessageSquare,
  Hash,
  X,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import {
  isNotificationSupported,
  requestPermission,
  getPermission,
} from "../lib/gigNotifications";

export default function WelcomeModal({ plan, onClose }) {
  const [notifEnabled, setNotifEnabled] = useState(
    getPermission?.() === "granted",
  );
  const isPro = plan === "pro" || plan === "pro_annual";

  async function handleEnableNotifications() {
    const granted = await requestPermission();
    if (granted) setNotifEnabled(true);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#020617] border border-white/10 max-w-md w-full rounded-2xl p-6 sm:p-8 relative animate-slideIn">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00F0B5] to-[#00D4FF] mb-4">
            <PartyPopper className="w-8 h-8 text-[#020617]" />
          </div>
          <h2 className="text-2xl font-extrabold text-white">You're in! 🎉</h2>
          <p className="text-gray-400 mt-2 text-sm">
            Your gig radar is now active. We'll alert you the moment a new gig
            matching your skills is posted.
          </p>
        </div>

        {/* Money Back Guarantee Reminder */}
        <div className="flex items-start gap-3 px-4 py-3.5 mb-5 bg-[#00F0B5]/[0.06] border border-[#00F0B5]/15 rounded-xl">
          <ShieldCheck className="w-5 h-5 text-[#00F0B5] shrink-0 mt-0.5" />
          <p className="text-xs text-gray-300 leading-relaxed">
            <span className="text-[#00F0B5] font-semibold">
              3-Day Money Back Guarantee.
            </span>{" "}
            If you're not satisfied for any reason, email us at{" "}
            <a
              href="mailto:support@gigalertpro.com"
              className="text-[#00F0B5] underline"
            >
              support@gigalertpro.com
            </a>{" "}
            and we'll refund you immediately.
          </p>
        </div>

        {/* Setup checklist */}
        <div className="glass-card rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Setup Checklist
          </h3>

          {/* Keywords - always done */}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-[#00F0B5]/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-[#00F0B5]" />
            </div>
            <span className="text-sm text-white">Keywords set up</span>
          </div>

          {/* Browser notifications */}
          <div className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center ${notifEnabled ? "bg-[#00F0B5]/20" : "bg-white/[0.04]"}`}
              >
                {notifEnabled ? (
                  <Check className="w-4 h-4 text-[#00F0B5]" />
                ) : (
                  <Square className="w-4 h-4 text-gray-500" />
                )}
              </div>
              <span className="text-sm text-white flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-gray-500" />
                Enable browser notifications
              </span>
            </div>
            {!notifEnabled && isNotificationSupported() && (
              <button
                onClick={handleEnableNotifications}
                className="px-3 py-1.5 bg-[#00F0B5] text-[#020617] text-xs font-bold rounded-lg hover:bg-[#00dba5] transition-all"
              >
                Enable
              </button>
            )}
          </div>

          {/* Telegram */}
          <div className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center">
                <Square className="w-4 h-4 text-gray-500" />
              </div>
              <span
                className={`text-sm flex items-center gap-1.5 ${isPro ? "text-white" : "text-gray-600"}`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                Connect Telegram
                {!isPro && (
                  <span className="text-[10px] text-gray-500 bg-white/[0.04] px-1.5 py-0.5 rounded">
                    Pro+
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Slack */}
          <div className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center">
                <Square className="w-4 h-4 text-gray-500" />
              </div>
              <span className="text-sm flex items-center gap-1.5 text-gray-600">
                <Hash className="w-3.5 h-3.5 text-gray-500" />
                Connect Slack
                <span className="text-[10px] text-gray-500 bg-white/[0.04] px-1.5 py-0.5 rounded">
                  Coming Soon
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Close CTA */}
        <button
          onClick={onClose}
          className="w-full mt-5 py-3 bg-[#00F0B5] text-[#020617] font-bold rounded-xl hover:bg-[#00dba5] hover:shadow-[0_0_20px_rgba(0,240,181,0.25)] transition-all duration-300"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
