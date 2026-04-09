import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ArrowRight, Check } from "lucide-react";
import { PAYMENTS_ENABLED } from "../../payments.config.js";

export default function PricingModal({ open, onClose }) {
  const { user } = useAuth();
  const [loadingTier, setLoadingTier] = useState(null);
  const [error, setError] = useState("");

  const plans = [
    {
      name: "Basic",
      tier: "basic",
      price: 9,
      features: [
        "All platforms — Reddit, X/Twitter, Craigslist & Threads",
        "Up to 5 active keywords",
        "10 AI proposals per day",
        "Browser notifications",
      ],
      ctaLabel: "Get Started",
    },
    {
      name: "Pro",
      tier: "pro",
      price: 29,
      popular: true,
      features: [
        "Everything in Basic",
        "Up to 20 active keywords",
        "50 AI proposals per day",
        "Priority access to new features",
      ],
      ctaLabel: "Get Started",
    },
    {
      name: "Agency",
      tier: "agency",
      price: 99,
      features: [
        "Everything in Pro",
        "Unlimited active keywords",
        "Unlimited AI proposals per day",
        "Priority support",
      ],
      ctaLabel: "Get Started",
    },
  ];

  async function handleCheckout(tier) {
    if (!PAYMENTS_ENABLED) {
      window.location.href = "/auth";
      return;
    }

    setError("");
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/create-dodo-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, email: user?.email ?? undefined }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
      <div className="bg-[#020617] border border-white/10 max-w-5xl w-full rounded-2xl p-8 my-auto">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-bold text-white">Choose a plan</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.tier}
              className={`relative flex flex-col p-6 rounded-2xl border ${
                plan.popular
                  ? "border-[#00F0B5] shadow-[0_0_30px_rgba(0,240,181,0.1)]"
                  : "border-white/10"
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
                  <span className="text-gray-400 text-sm">/mo</span>
                </div>
              </div>

              <ul className="space-y-3 text-sm text-gray-300 flex-1 mb-6">
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

        {error && (
          <p className="text-red-400 mt-6 text-sm text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
