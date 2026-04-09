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
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 bg-black/60">
      <div className="bg-[#020617] max-w-5xl w-full rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">Choose a plan</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-sm"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.tier}
              className={`p-4 rounded-xl border ${
                plan.popular ? "border-[#00F0B5]" : "border-white/10"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h4 className="font-semibold text-lg">{plan.name}</h4>
                <div className="text-2xl font-extrabold">
                  ${plan.price}
                  <span className="text-sm font-medium ml-1">/mo</span>
                </div>
              </div>

              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#00F0B5]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                <button
                  disabled={!!loadingTier}
                  onClick={() => handleCheckout(plan.tier)}
                  className="w-full py-2 bg-[#00F0B5] text-[#020617] font-bold rounded-xl flex items-center justify-center gap-2"
                >
                  {loadingTier === plan.tier ? "Redirecting..." : plan.ctaLabel}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-red-400 mt-4">{error}</p>}
      </div>
    </div>
  );
}
