// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/verify-checkout
//
// Safety-net endpoint called by the frontend after returning from a Dodo
// checkout.  It looks up the user's Supabase profile by their auth JWT,
// checks Dodo Payments for an active subscription matching their email,
// and activates the profile directly — no webhook dependency.
//
// Required env vars:
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DODO_PAYMENTS_API_KEY,
//   DODO_PAYMENTS_ENVIRONMENT, DODO_PRODUCT_BASIC, DODO_PRODUCT_PRO,
//   DODO_PRODUCT_AGENCY
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DODO_API_KEY = process.env.DODO_PAYMENTS_API_KEY;
const DODO_ENV = process.env.DODO_PAYMENTS_ENVIRONMENT || "live_mode";
const DODO_BASE_URL =
  DODO_ENV === "test_mode"
    ? "https://test.dodopayments.com"
    : "https://live.dodopayments.com";

const PRODUCT_TO_PLAN = {
  [process.env.DODO_PRODUCT_BASIC]: "basic",
  [process.env.DODO_PRODUCT_PRO]: "pro",
  [process.env.DODO_PRODUCT_AGENCY]: "agency",
};

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !DODO_API_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  // ── 1. Authenticate the caller via their Supabase JWT ──────────────────
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  let userId, userEmail;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: "Invalid auth token" });
    }
    const userData = await userRes.json();
    userId = userData.id;
    userEmail = userData.email;
  } catch {
    return res.status(401).json({ error: "Auth verification failed" });
  }

  if (!userId || !userEmail) {
    return res.status(400).json({ error: "Could not resolve user" });
  }

  // ── 2. Check if already active — nothing to do ────────────────────────
  try {
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=subscription_status,plan`,
      { headers: supabaseHeaders() },
    );
    const profiles = await profileRes.json().catch(() => []);
    if (
      profiles?.[0]?.subscription_status === "active" &&
      ["basic", "pro", "agency"].includes(profiles?.[0]?.plan)
    ) {
      return res.status(200).json({ status: "already_active" });
    }
  } catch {
    // continue to Dodo check
  }

  // ── 3. Query Dodo for subscriptions matching this email ────────────────
  try {
    const subsRes = await fetch(`${DODO_BASE_URL}/subscriptions`, {
      headers: {
        Authorization: `Bearer ${DODO_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!subsRes.ok) {
      console.error(
        "[verify-checkout] Dodo subscriptions list failed:",
        subsRes.status,
      );
      return res.status(502).json({ error: "Could not verify with Dodo" });
    }

    const subsData = await subsRes.json();
    const subscriptions = Array.isArray(subsData)
      ? subsData
      : subsData?.items || subsData?.data || [];

    // Find an active subscription for this user's email
    const match = subscriptions.find((s) => {
      const email = s?.customer?.email?.toLowerCase();
      const metaEmail = s?.metadata?.auth_email?.toLowerCase();
      const metaUid = s?.metadata?.auth_user_id;
      const isActive = s?.status === "active";
      return (
        isActive &&
        (metaUid === userId ||
          metaEmail === userEmail.toLowerCase() ||
          email === userEmail.toLowerCase())
      );
    });

    if (!match) {
      return res.status(200).json({ status: "no_active_subscription" });
    }

    // ── 4. Resolve the plan tier ──────────────────────────────────────────
    const productId = match?.product_id || match?.items?.[0]?.product_id;
    let plan =
      (productId && PRODUCT_TO_PLAN[productId]) ||
      match?.metadata?.tier ||
      "basic";
    if (!["basic", "pro", "agency"].includes(plan)) plan = "basic";

    const interval = match?.payment_frequency_interval;
    const period =
      interval === "Year" || interval === "year" ? "yearly" : "monthly";

    // ── 5. Activate the profile ───────────────────────────────────────────
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        plan,
        subscription_status: "active",
        billing_period: period,
        dodo_subscription_id: match?.subscription_id || match?.id || null,
        cancel_at_period_end: false,
        email: userEmail,
        updated_at: new Date().toISOString(),
      }),
    });

    console.info(
      `[verify-checkout] Activated ${plan} for ${userEmail} (uid: ${userId})`,
    );
    return res.status(200).json({ status: "activated", plan });
  } catch (err) {
    console.error("[verify-checkout] Error:", err.message);
    return res.status(500).json({ error: "Verification failed" });
  }
}
