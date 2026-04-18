import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { PAYMENTS_ENABLED } from "../../payments.config.js";
import {
  trackPricingModalViewed,
  trackPricingModalClosed,
  trackPricingCheckoutStarted,
} from "../lib/umami";

export default function PricingModal({ open, onClose }) {
  const { user } = useAuth();
  const [loadingTier, setLoadingTier] = useState(null);
  const [error, setError] = useState("");
  const [billingPeriod, setBillingPeriod] = useState("monthly");
  const isAnnual = billingPeriod === "annual";

  useEffect(() => {
    if (open) trackPricingModalViewed("app");
  }, [open]);

  const DODO_LINKS = {
    basic: import.meta.env.NEXT_PUBLIC_DODO_LINK_BASIC || "",
    basic_annual: import.meta.env.NEXT_PUBLIC_DODO_LINK_BASIC_ANNUAL || "",
    pro: import.meta.env.NEXT_PUBLIC_DODO_LINK_PRO || "",
    pro_annual: import.meta.env.NEXT_PUBLIC_DODO_LINK_PRO_ANNUAL || "",
  };

  const plans = isAnnual
    ? [
        {
          name: "Basic",
          tier: "basic_annual",
          price: 122,
          priceSuffix: "/year",
          crossedOut: "$144/year",
          saveBadge: "Save $22 — 15% off",
          features: [
            "25 daily alerts",
            "Reddit, X and Threads",
            "5 keyword trackers",
            "Gig quality scoring",
            "10 AI proposals per day",
            "Browser and email notifications",
            "Profile builder",
          ],
          ctaLabel: "Get Started",
          ctaLink: DODO_LINKS.basic_annual,
        },
        {
          name: "Pro",
          tier: "pro_annual",
          price: 296,
          priceSuffix: "/year",
          crossedOut: "$348/year",
          saveBadge: "Save $52 — 15% off",
          popular: true,
          features: [
            "Everything in Basic",
            "100 daily alerts",
            "20 keyword trackers",
            "Unlimited AI proposals",
            "AI learns from winning proposals",
            "Priority scanning every 10 minutes",
            "Won/Reply/No Response analytics",
          ],
          ctaLabel: "Get Started",
          ctaLink: DODO_LINKS.pro_annual,
        },
      ]
    : [
        {
          name: "Basic",
          tier: "basic",
          price: 12,
          priceSuffix: "/month",
          features: [
            "25 daily alerts",
            "Reddit, X and Threads",
            "5 keyword trackers",
            "Gig quality scoring",
            "10 AI proposals per day",
            "Browser and email notifications",
            "Profile builder",
          ],
          ctaLabel: "Get Started",
          ctaLink: DODO_LINKS.basic,
        },
        {
          name: "Pro",
          tier: "pro",
          price: 29,
          priceSuffix: "/month",
          popular: true,
          features: [
            "Everything in Basic",
            "100 daily alerts",
            "20 keyword trackers",
            "Unlimited AI proposals",
            "AI learns from winning proposals",
            "Priority scanning every 10 minutes",
            "Won/Reply/No Response analytics",
          ],
          ctaLabel: "Get Started",
          ctaLink: DODO_LINKS.pro,
        },
      ];

  async function handleCheckout(tier) {
    if (!PAYMENTS_ENABLED) {
      window.location.href = "/auth";
      return;
    }

    setError("");
    setLoadingTier(tier);
    const plan = plans.find((p) => p.tier === tier);
    trackPricingCheckoutStarted(tier, plan?.price);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
      <div className="bg-[#020617] border border-white/10 max-w-5xl w-full rounded-2xl p-8 my-auto">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-bold text-white">Choose a plan</h3>

          {/* Guarantee banner */}
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#00F0B5] shrink-0" />
            <p className="text-sm text-gray-400">
              <span className="text-[#00F0B5] font-semibold">
                3-Day Money Back Guarantee
              </span>{" "}
              Try risk-free. Full refund if you're not satisfied.
            </p>
          </div>
          <button
            onClick={() => {
              trackPricingModalClosed();
              onClose();
            }}
            className="text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Monthly / Annual toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-full p-1">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${
                !isAnnual
                  ? "bg-[#00F0B5] text-[#020617]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("annual")}
              className={`px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${
                isAnnual
                  ? "bg-[#00F0B5] text-[#020617]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Annual <span className="text-xs opacity-80">Save 15%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                {plan.crossedOut && (
                  <p className="text-gray-500 text-sm line-through">
                    {plan.crossedOut}
                  </p>
                )}
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    ${plan.price}
                  </span>
                  <span className="text-gray-400 text-sm">
                    {plan.priceSuffix}
                  </span>
                </div>
                {plan.saveBadge && (
                  <span className="inline-block mt-2 px-2.5 py-1 bg-[#00F0B5]/10 text-[#00F0B5] text-xs font-bold rounded-full border border-[#00F0B5]/20">
                    {plan.saveBadge}
                  </span>
                )}
              </div>

              <ul className="space-y-3 text-sm text-gray-300 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#00F0B5] shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {plan.ctaLink ? (
                <a
                  href={plan.ctaLink}
                  onClick={() =>
                    trackPricingCheckoutStarted(plan.tier, plan.price)
                  }
                  className={`w-full py-3 font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 ${
                    plan.popular
                      ? "bg-[#00F0B5] text-[#020617] hover:bg-[#00dba5] hover:shadow-[0_0_20px_rgba(0,240,181,0.25)]"
                      : "bg-white/5 text-white border border-white/10 hover:bg-white/10"
                  }`}
                >
                  {plan.ctaLabel}
                  <ArrowRight className="w-4 h-4" />
                </a>
              ) : (
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
              )}
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
