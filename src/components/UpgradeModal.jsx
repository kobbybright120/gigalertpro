import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ArrowRight, Check, X, Bell } from "lucide-react";

export default function UpgradeModal({ open, onClose, gigCount = 0 }) {
  const { user } = useAuth();
  const [loadingTier, setLoadingTier] = useState(null);
  const [error, setError] = useState("");

  const plans = [
    {
      name: "Basic",
      tier: "basic",
      price: 9,
      features: [
        "1 Keyword Tracker",
        "25 Daily Alerts",
        "Email Notifications",
        "Unlimited AI Proposals",
        "Reddit only",
      ],
      ctaLabel: "Start with Basic",
    },
    {
      name: "Pro",
      tier: "pro",
      price: 29,
      popular: true,
      features: [
        "3 Keyword Trackers",
        "100 Daily Alerts",
        "Email + Telegram",
        "Unlimited AI Proposals",
        "Reddit + X + Threads",
        "Priority scanning every 10 min",
      ],
      ctaLabel: "Go Pro",
    },
    {
      name: "Agency",
      tier: "agency",
      price: 99,
      features: [
        "10 Keyword Trackers",
        "500 Daily Alerts",
        "Email + Telegram + Slack",
        "Unlimited AI Proposals",
        "All platforms",
        "5 Team Seats",
        "Priority scanning every 5 min",
      ],
      ctaLabel: "Get Agency",
    },
  ];

  async function handleCheckout(tier) {
    setError("");
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/create-dodo-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          email: user?.email ?? undefined,
          userId: user?.id ?? undefined,
        }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setError(data?.error || "Checkout not configured");
        setLoadingTier(null);
      }
    } catch (err) {
      setError(err?.message || "Checkout failed");
      setLoadingTier(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#020617] border border-white/10 max-w-5xl w-full rounded-2xl p-6 sm:p-8 my-auto relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
            You're missing{" "}
            <span className="text-gradient">{gigCount} gigs</span> right now 🔔
          </h3>
          <p className="text-gray-400 mt-3 text-sm sm:text-base max-w-2xl mx-auto">
            Clients are posting on Reddit, X, Threads and Craigslist looking for
            your skills. Upgrade to get instant alerts and AI proposals before
            anyone else applies.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.tier}
              className={`relative flex flex-col p-6 rounded-2xl border transition-all duration-200 ${
                plan.popular
                  ? "border-[#00F0B5] shadow-[0_0_30px_rgba(0,240,181,0.1)] bg-[#00F0B5]/[0.02]"
                  : "border-white/10 hover:border-white/15"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-[#00F0B5] text-[#020617] text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-5">
                <h4 className="font-bold text-xl text-white mb-1">
                  {plan.name}
                </h4>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    ${plan.price}
                  </span>
                  <span className="text-gray-400 text-sm">/month</span>
                </div>
              </div>

              <ul className="space-y-2.5 text-sm text-gray-300 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#00F0B5] shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                disabled={!!loadingTier}
                onClick={() => handleCheckout(plan.tier)}
                className={`w-full py-3 font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 ${
                  plan.popular
                    ? "bg-[#00F0B5] text-[#020617] hover:bg-[#00dba5] hover:shadow-[0_0_20px_rgba(0,240,181,0.25)]"
                    : "bg-white/5 text-white border border-white/10 hover:bg-white/10"
                }`}
              >
                {loadingTier === plan.tier ? "Redirecting..." : plan.ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-6 text-sm text-gray-400">
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-[#00F0B5]" />7 day free trial on all
            plans
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-[#00F0B5]" />
            Cancel anytime
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-[#00F0B5]" />
            No hidden fees
          </span>
        </div>

        {error && (
          <p className="text-red-400 mt-4 text-sm text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
