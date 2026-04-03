// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/create-checkout
//
// Creates a Stripe Checkout Session for monthly or yearly subscription.
// Accepts:  { period: "monthly" | "yearly" }
// Returns:  { url: string }  — redirect to Stripe hosted checkout
//
// Required env vars (set in Vercel dashboard):
//   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
//   STRIPE_PRICE_MONTHLY       — price_xxx  (Monthly $20 price ID from Stripe)
//   STRIPE_PRICE_YEARLY        — price_xxx  (Yearly $192 price ID from Stripe)
//   APP_URL                    — https://gigalertpro.com (no trailing slash)
// ─────────────────────────────────────────────────────────────────────────────

import { PAYMENTS_ENABLED } from "../payments.config.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
const STRIPE_PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY;
const APP_URL = (process.env.APP_URL || "https://gigalertpro.com").replace(
  /\/$/,
  "",
);

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "POST" && !PAYMENTS_ENABLED) {
    return res.status(503).json({ error: "Payments temporarily disabled" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  const { period } = req.body || {};
  if (!period || !["monthly", "yearly"].includes(period)) {
    return res
      .status(400)
      .json({ error: "Invalid period. Use 'monthly' or 'yearly'." });
  }

  const priceId =
    period === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;

  if (!priceId) {
    return res
      .status(503)
      .json({ error: `Stripe price for '${period}' not configured` });
  }

  try {
    const stripeRes = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          "payment_method_types[0]": "card",
          "line_items[0][price]": priceId,
          "line_items[0][quantity]": "1",
          mode: "subscription",
          // 7-day free trial
          "subscription_data[trial_period_days]": "7",
          success_url: `${APP_URL}/dashboard?checkout=success`,
          cancel_url: `${APP_URL}/#pricing`,
          // Allow promotion codes (discount coupons)
          allow_promotion_codes: "true",
          // Collect billing address for tax purposes
          billing_address_collection: "auto",
        }).toString(),
      },
    );

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error("[checkout] Stripe error:", session.error);
      return res
        .status(502)
        .json({ error: session.error?.message || "Stripe error" });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Fatal:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
