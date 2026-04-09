import { useState, useEffect, useRef } from "react";
import { useProfile } from "../lib/useSupabase";
import PricingModal from "./PricingModal";
import { Zap, ArrowRight, Shield, Star, CheckCircle2 } from "lucide-react";
import { PAYMENTS_ENABLED } from "../../payments.config.js";

const DISABLE_AUTH =
  import.meta.env.VITE_DISABLE_AUTH === "true" ||
  !import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env.VITE_SUPABASE_URL || "").includes("placeholder") ||
  !import.meta.env.VITE_SUPABASE_ANON_KEY;

const ACTIVE_STATUSES = ["active"];
// How long to poll after checkout=success (ms) and interval between polls
const POLL_TIMEOUT = 60_000;
const POLL_INTERVAL = 3_000;

export default function SubscriptionGate({ children }) {
  console.debug("SubscriptionGate: PAYMENTS_ENABLED=", PAYMENTS_ENABLED);
  // Hooks must be called unconditionally at the top of the component
  const { profile, loading, refetch } = useProfile();
  const [showPricing, setShowPricing] = useState(false);

  // Detect ?checkout=success in URL — start polling profile until active
  const isCheckoutReturn =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("checkout") === "success";
  const [polling, setPolling] = useState(isCheckoutReturn);
  const pollRef = useRef(null);
  const pollStart = useRef(Date.now());

  useEffect(() => {
    if (!isCheckoutReturn || !PAYMENTS_ENABLED || DISABLE_AUTH) return;

    const tick = async () => {
      await refetch();
      // Stop polling if active or timed out
      if (
        Date.now() - pollStart.current > POLL_TIMEOUT
      ) {
        clearInterval(pollRef.current);
        setPolling(false);
      }
    };

    pollRef.current = setInterval(tick, POLL_INTERVAL);
    // Run once immediately
    tick();

    return () => clearInterval(pollRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once the profile becomes active, stop polling and clear the URL param
  useEffect(() => {
    if (polling && profile?.subscription_status && ACTIVE_STATUSES.includes(profile.subscription_status)) {
      clearInterval(pollRef.current);
      setPolling(false);
      // Clean up the ?checkout=success from the URL without a page reload
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("checkout");
        window.history.replaceState({}, "", url.toString());
      } catch (_) {}
    }
  }, [profile, polling]);

  if (!PAYMENTS_ENABLED) return children;

  // Demo mode — skip gate
  if (DISABLE_AUTH) return children;

  // Returned from checkout — show "Activating" spinner while polling
  if (polling) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] gap-5">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#00F0B5] border-t-transparent" />
        <div className="text-center">
          <p className="text-white font-bold text-lg">Activating your subscription…</p>
          <p className="text-gray-500 text-sm mt-1">This usually takes a few seconds. Please wait.</p>
        </div>
      </div>
    );
  }

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
            Subscribe to access the dashboard, AI proposals, and real-time gig
            alerts.
          </p>
        </div>

        {/* Features */}
        <div className="glass-card rounded-2xl p-6 mb-6 border-[#00F0B5]/10">
          <ul className="space-y-3">
            {[
              "Keyword alerts across 37+ sources",
              "Reddit, Craigslist & X/Twitter scanning",
              "Gig quality scoring (0–100)",
              "AI proposal generator",
              "Browser push notifications",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-[#00F0B5] shrink-0" />
                <span className="text-gray-300">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowPricing(true)}
          className="w-full py-3.5 bg-[#00F0B5] text-[#020617] font-bold rounded-xl hover:bg-[#00dba5] hover:shadow-[0_0_20px_rgba(0,240,181,0.25)] transition-all duration-300 flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" />
          View Plans
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-center text-xs text-gray-600 mt-3">
          Cancel anytime.
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
      <PricingModal open={showPricing} onClose={() => setShowPricing(false)} />
    </div>
  );
}
