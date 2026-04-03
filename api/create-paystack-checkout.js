// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/create-paystack-checkout
//
// Initialises a Paystack transaction for monthly or yearly subscription.
// Accepts:  { period: "monthly" | "yearly", email?: string }
// Returns:  { url: string }  — redirect to Paystack hosted checkout
//
// Required env vars (set in Vercel dashboard):
//   PAYSTACK_SECRET_KEY        — sk_test_... or sk_live_...
//   PAYSTACK_PLAN_MONTHLY      — PLN_xxx  (Monthly plan code from Paystack)
//   PAYSTACK_PLAN_YEARLY       — PLN_xxx  (Yearly plan code from Paystack)
//   APP_URL                    — https://gigalertpro.com (no trailing slash)
// ─────────────────────────────────────────────────────────────────────────────

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PLAN_MONTHLY = process.env.PAYSTACK_PLAN_MONTHLY;
const PAYSTACK_PLAN_YEARLY = process.env.PAYSTACK_PLAN_YEARLY;
const APP_URL = (
  process.env.APP_URL || "https://gigalertpro.com"
).replace(/\/$/, "");

// ── Plan auto-creation cache (per cold start) ─────────────────────────────────
// If PAYSTACK_PLAN_MONTHLY / PAYSTACK_PLAN_YEARLY are not set, we create the
// plans automatically. Plan codes are cached in memory so we only create once
// per serverless container lifetime.
const _planCache = {};

async function getOrCreatePlan(period) {
  const envCode =
    period === "yearly" ? PAYSTACK_PLAN_YEARLY : PAYSTACK_PLAN_MONTHLY;
  if (envCode) return envCode;

  // Return from in-memory cache if available
  if (_planCache[period]) return _planCache[period];

  const name =
    period === "yearly"
      ? "GigAlertPro Yearly ($192)"
      : "GigAlertPro Monthly ($20)";
  const interval = period === "yearly" ? "annually" : "monthly";
  // Paystack amounts are in the smallest currency unit.
  // USD: $20 = 2000 cents, $192 = 19200 cents
  const amount = period === "yearly" ? 19200 : 2000;

  const res = await fetch("https://api.paystack.co/plan", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, interval, amount, currency: "USD" }),
  });

  const json = await res.json();

  if (!res.ok || !json.data?.plan_code) {
    throw new Error(
      `Paystack plan creation failed: ${json.message || "unknown error"}`
    );
  }

  const code = json.data.plan_code;
  _planCache[period] = code;

  // Log the plan code so the operator can persist it in env vars
  console.info(
    `[paystack] Auto-created ${period} plan. Set PAYSTACK_PLAN_${period.toUpperCase()}=${code} in Vercel env vars.`
  );

  return code;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!PAYSTACK_SECRET_KEY) {
    return res.status(503).json({ error: "Paystack not configured" });
  }

  const { period, email } = req.body || {};

  if (!period || !["monthly", "yearly"].includes(period)) {
    return res
      .status(400)
      .json({ error: "Invalid period. Use 'monthly' or 'yearly'." });
  }

  try {
    const planCode = await getOrCreatePlan(period);

    // Build transaction init payload
    const payload = {
      plan: planCode,
      callback_url: `${APP_URL}/dashboard?checkout=success`,
      currency: "USD",
      // Metadata for webhook reconciliation
      metadata: {
        period,
        cancel_action: `${APP_URL}/#pricing`,
      },
    };

    // email is required by Paystack — use the authenticated user's email if
    // provided; otherwise Paystack will collect it on the hosted page.
    if (email) payload.email = email;
    else {
      // Paystack requires an email. Use a placeholder and let Paystack prompt.
      // If you always have the user email from Supabase, pass it from the frontend.
      payload.email = `guest_${Date.now()}@checkout.gigalertpro.com`;
    }

    const initRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const initData = await initRes.json();

    if (!initRes.ok || !initData.data?.authorization_url) {
      console.error("[paystack] Init error:", initData);
      return res
        .status(502)
        .json({ error: initData.message || "Paystack initialisation failed" });
    }

    return res.status(200).json({ url: initData.data.authorization_url });
  } catch (err) {
    console.error("[paystack] Fatal:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
