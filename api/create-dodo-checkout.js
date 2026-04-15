// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/create-dodo-checkout
//
// Creates a Dodo Payments Checkout Session for a subscription tier.
// Accepts:  { tier: "basic" | "basic_annual" | "pro" | "pro_annual", email?: string }
// Returns:  { url: string }  — redirect to Dodo hosted checkout
//
// Required env vars (set in Vercel dashboard):
//   DODO_PAYMENTS_API_KEY          — your Dodo Payments API key
//   DODO_PRODUCT_BASIC             — product ID for Basic plan  ($12/mo)
//   DODO_PRODUCT_BASIC_ANNUAL      — product ID for Basic Annual ($122/yr)
//   DODO_PRODUCT_PRO               — product ID for Pro plan    ($29/mo)
//   DODO_PRODUCT_PRO_ANNUAL        — product ID for Pro Annual  ($296/yr)
//   DODO_PAYMENTS_ENVIRONMENT      — "test_mode" or "live_mode" (defaults to "live_mode")
//   APP_URL                        — https://gigalertpro.com (no trailing slash)
// ─────────────────────────────────────────────────────────────────────────────

import { PAYMENTS_ENABLED } from "../payments.config.js";

const DODO_API_KEY = process.env.DODO_PAYMENTS_API_KEY;
const DODO_PRODUCT_BASIC = process.env.DODO_PRODUCT_BASIC;
const DODO_PRODUCT_BASIC_ANNUAL = process.env.DODO_PRODUCT_BASIC_ANNUAL;
const DODO_PRODUCT_PRO = process.env.DODO_PRODUCT_PRO;
const DODO_PRODUCT_PRO_ANNUAL = process.env.DODO_PRODUCT_PRO_ANNUAL;
const DODO_ENV = process.env.DODO_PAYMENTS_ENVIRONMENT || "live_mode";
const APP_URL = (process.env.APP_URL || "https://gigalertpro.com").replace(
  /\/$/,
  "",
);

// Dodo Payments base URL varies by environment
const DODO_BASE_URL =
  DODO_ENV === "test_mode"
    ? "https://test.dodopayments.com"
    : "https://live.dodopayments.com";

const VALID_TIERS = ["basic", "basic_annual", "pro", "pro_annual"];

const PRODUCT_MAP = {
  basic: DODO_PRODUCT_BASIC,
  basic_annual: DODO_PRODUCT_BASIC_ANNUAL,
  pro: DODO_PRODUCT_PRO,
  pro_annual: DODO_PRODUCT_PRO_ANNUAL,
};

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!PAYMENTS_ENABLED) {
    return res.status(503).json({ error: "Payments temporarily disabled" });
  }

  if (!DODO_API_KEY) {
    return res.status(503).json({ error: "Dodo Payments not configured" });
  }

  const { tier, email, userId } = req.body || {};

  if (!tier || !VALID_TIERS.includes(tier)) {
    return res
      .status(400)
      .json({
        error:
          "Invalid tier. Use 'basic', 'basic_annual', 'pro', or 'pro_annual'.",
      });
  }

  const productId = PRODUCT_MAP[tier];

  if (!productId) {
    return res
      .status(503)
      .json({ error: `Dodo product for '${tier}' plan not configured` });
  }

  try {
    // Build the Checkout Session payload
    const payload = {
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: `${APP_URL}/dashboard?checkout=success`,
      payment_link: true,
      metadata: { tier, auth_email: email || "", auth_user_id: userId || "" },
    };

    // Attach customer email if available
    if (email) {
      payload.customer = {
        email,
        name: email.split("@")[0],
      };
    }

    const checkoutRes = await fetch(`${DODO_BASE_URL}/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DODO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const checkoutData = await checkoutRes.json();

    if (!checkoutRes.ok || !checkoutData.checkout_url) {
      console.error("[dodo] Checkout session error:", checkoutData);
      return res.status(502).json({
        error: checkoutData.message || "Dodo checkout session creation failed",
      });
    }

    return res.status(200).json({ url: checkoutData.checkout_url });
  } catch (err) {
    console.error("[dodo] Fatal:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
