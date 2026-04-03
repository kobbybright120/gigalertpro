import { useProfile } from "../lib/useSupabase";
import { Link } from "react-router-dom";
import { Zap, ArrowRight, Shield, Star, CheckCircle2 } from "lucide-react";
import { PAYMENTS_ENABLED } from "../../payments.config.js";

const DISABLE_AUTH =
  import.meta.env.VITE_DISABLE_AUTH === "true" ||
  !import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env.VITE_SUPABASE_URL || "").includes("placeholder") ||
  !import.meta.env.VITE_SUPABASE_ANON_KEY;

const ACTIVE_STATUSES = ["active", "trialing"];

export default function SubscriptionGate({ children }) {
  if (!PAYMENTS_ENABLED) return children;
  const { profile, loading } = useProfile();

  // Demo mode — skip gate
  if (DISABLE_AUTH) return children;

  // Still loading profile
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#00F0B5] border-t-transparent" />
      </div>
    );
  }

  // Active subscription — allow access
  const status = profile?.subscription_status;
  if (status && ACTIVE_STATUSES.includes(status)) {
    return children;
  }

  // No active subscription — show upgrade prompt
  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#00F0B5]/[0.03] rounded-full blur-[100px]" />

      <div className="max-w-lg w-full relative">
        {/* Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00F0B5] to-[#00D4FF] shadow-[0_0_30px_rgba(0,240,181,0.15)] mb-5">
            <Shield className="w-8 h-8 text-[#020617]" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Unlock GigAlert<span className="text-gradient">Pro</span>
          </h1>
          <p className="text-gray-400 mt-3 text-base max-w-md mx-auto">
            Start your 7-day free trial to access the dashboard, AI proposals,
            and real-time gig alerts.
          </p>
        </div>

        {/* Features */}
        <div className="glass-card rounded-2xl p-6 mb-6 border-[#00F0B5]/10">
          <ul className="space-y-3">
            {[
              "Unlimited keyword alerts",
              "Reddit, Craigslist & X/Twitter scanning",
              "Gig quality scoring (0–100)",
              "50 AI proposals per day",
              "Browser + email notifications",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-[#00F0B5] shrink-0" />
                <span className="text-gray-300">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <Link
          to="/landing#pricing"
          className="w-full py-3.5 bg-[#00F0B5] text-[#020617] font-bold rounded-xl hover:bg-[#00dba5] hover:shadow-[0_0_20px_rgba(0,240,181,0.25)] transition-all duration-300 flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" />
          Start 7-Day Free Trial
          <ArrowRight className="w-4 h-4" />
        </Link>

        <p className="text-center text-xs text-gray-600 mt-3">
          No credit card required to start. Cancel anytime.
        </p>

        {/* Status pill */}
        {status && (
          <div className="text-center mt-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-medium">
              <Star className="w-3 h-3" />
              Subscription: {status}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
