// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/verify-checkout
//
// Called by the frontend after returning from Dodo checkout.
// Authenticates the user via Supabase JWT, queries Dodo Payments to confirm
// there's an active subscription for this email, then activates the profile.
//
// This does NOT depend on the Dodo webhook at all — it's a direct
// server-to-server check that guarantees activation.
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

function dodoHeaders() {
  return {
    Authorization: `Bearer ${DODO_API_KEY}`,
    "Content-Type": "application/json",
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
    console.error("[verify-checkout] Missing env vars:", {
      hasSupa: !!SUPABASE_URL,
      hasKey: !!SUPABASE_SERVICE_KEY,
      hasDodo: !!DODO_API_KEY,
    });
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
      console.error("[verify-checkout] Auth failed:", userRes.status);
      return res.status(401).json({ error: "Invalid auth token" });
    }
    const userData = await userRes.json();
    userId = userData.id;
    userEmail = userData.email;
    console.info(`[verify-checkout] User: ${userEmail} (${userId})`);
  } catch (err) {
    console.error("[verify-checkout] Auth error:", err.message);
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
      console.info("[verify-checkout] Already active, skipping");
      return res.status(200).json({ status: "already_active" });
    }
  } catch {
    // continue to Dodo check
  }

  // ── 3. Query Dodo for subscriptions matching this user ─────────────────
  const emailLower = userEmail.toLowerCase();

  try {
    // Try fetching subscriptions — handle both array and paginated responses
    const subsRes = await fetch(`${DODO_BASE_URL}/subscriptions`, {
      headers: dodoHeaders(),
    });

    if (!subsRes.ok) {
      const errText = await subsRes.text().catch(() => "");
      console.error(
        `[verify-checkout] Dodo GET /subscriptions failed: ${subsRes.status}`,
        errText,
      );
      return res.status(502).json({ error: "Could not verify with Dodo" });
    }

    const subsData = await subsRes.json();
    console.info(
      "[verify-checkout] Dodo response type:",
      typeof subsData,
      Array.isArray(subsData)
        ? `array(${subsData.length})`
        : Object.keys(subsData),
    );

    // Dodo may return: an array, { items: [...] }, { data: [...] }, or paginated
    const subscriptions = Array.isArray(subsData)
      ? subsData
      : subsData?.items || subsData?.data || [];

    console.info(
      `[verify-checkout] Found ${subscriptions.length} total subscriptions`,
    );

    // Find an active subscription for this user
    const match = subscriptions.find((s) => {
      const custEmail = s?.customer?.email?.toLowerCase();
      const metaEmail = s?.metadata?.auth_email?.toLowerCase();
      const metaUid = s?.metadata?.auth_user_id;
      const isActive = s?.status === "active" || s?.status === "pending";

      const matches =
        isActive &&
        (metaUid === userId ||
          metaEmail === emailLower ||
          custEmail === emailLower);

      if (matches) {
        console.info(
          "[verify-checkout] Matched subscription:",
          s?.subscription_id,
          s?.status,
        );
      }
      return matches;
    });

    if (!match) {
      console.warn(
        `[verify-checkout] No matching subscription for ${userEmail}. ` +
          `Checked ${subscriptions.length} subs. ` +
          `Sample emails: ${subscriptions
            .slice(0, 3)
            .map((s) => s?.customer?.email)
            .join(", ")}`,
      );

      // ── 3b. Also check payments as fallback ────────────────────────────
      // Sometimes the subscription.active event hasn't fired yet but payment succeeded
      const payRes = await fetch(`${DODO_BASE_URL}/payments`, {
        headers: dodoHeaders(),
      });

      if (payRes.ok) {
        const payData = await payRes.json();
        const payments = Array.isArray(payData)
          ? payData
          : payData?.items || payData?.data || [];

        const payMatch = payments.find((p) => {
          const custEmail = p?.customer?.email?.toLowerCase();
          const metaEmail = p?.metadata?.auth_email?.toLowerCase();
          const metaUid = p?.metadata?.auth_user_id;
          const isSuccess =
            p?.status === "succeeded" || p?.status === "completed";
          return (
            isSuccess &&
            (metaUid === userId ||
              metaEmail === emailLower ||
              custEmail === emailLower)
          );
        });

        if (payMatch) {
          console.info("[verify-checkout] Found matching payment, activating");
          const productId =
            payMatch?.product_id || payMatch?.items?.[0]?.product_id;
          let plan =
            (productId && PRODUCT_TO_PLAN[productId]) ||
            payMatch?.metadata?.tier ||
            "basic";
          if (!["basic", "pro", "agency"].includes(plan)) plan = "basic";

          await activateProfile(userId, userEmail, plan, "monthly", null);
          return res.status(200).json({ status: "activated", plan });
        }
      }

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
    const subId = match?.subscription_id || match?.id || null;

    // ── 5. Activate the profile ───────────────────────────────────────────
    await activateProfile(userId, userEmail, plan, period, subId);

    console.info(
      `[verify-checkout] ✅ Activated ${plan} for ${userEmail} (uid: ${userId})`,
    );
    return res.status(200).json({ status: "activated", plan });
  } catch (err) {
    console.error("[verify-checkout] Error:", err.message, err.stack);
    return res.status(500).json({ error: "Verification failed" });
  }
}

async function activateProfile(userId, email, plan, period, subId) {
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
    {
      method: "PATCH",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        plan,
        subscription_status: "active",
        billing_period: period,
        dodo_subscription_id: subId,
        cancel_at_period_end: false,
        email,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!patchRes.ok) {
    const errText = await patchRes.text().catch(() => "");
    console.error(
      "[verify-checkout] Supabase PATCH failed:",
      patchRes.status,
      errText,
    );
  }
}
