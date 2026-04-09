// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/cancel-subscription
//
// Cancels the authenticated user's Dodo Payments subscription at the end of
// the current billing period (no immediate revocation).
//
// Headers:  Authorization: Bearer <supabase-access-token>
// Returns:  { ok: true }
//
// Required env vars:
//   DODO_PAYMENTS_API_KEY      — Dodo API key
//   DODO_PAYMENTS_ENVIRONMENT  — "test_mode" or "live_mode"
//   VITE_SUPABASE_URL          — Supabase project URL
//   VITE_SUPABASE_ANON_KEY     — Supabase anon key (for JWT verification)
//   SUPABASE_SERVICE_ROLE_KEY  — service role key (for profile update)
// ─────────────────────────────────────────────────────────────────────────────

const DODO_API_KEY = process.env.DODO_PAYMENTS_API_KEY;
const DODO_ENV = process.env.DODO_PAYMENTS_ENVIRONMENT || "live_mode";
const DODO_BASE_URL =
  DODO_ENV === "test_mode"
    ? "https://test.dodopayments.com"
    : "https://live.dodopayments.com";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_AUTH_URL = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/user` : null;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

async function getSupabaseUser(token) {
  if (!SUPABASE_AUTH_URL) return null;
  const res = await fetch(SUPABASE_AUTH_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.VITE_SUPABASE_ANON_KEY || "",
    },
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1. Authenticate via Supabase JWT
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const supabaseUser = await getSupabaseUser(token);
  if (!supabaseUser?.id) {
    return res.status(401).json({ error: "Invalid auth token" });
  }

  // 2. Look up the user's subscription ID from their profile
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${supabaseUser.id}&select=dodo_subscription_id,subscription_status`,
    { headers: supabaseHeaders() },
  );
  const profiles = await profileRes.json().catch(() => []);
  const profile = profiles?.[0];

  if (!profile?.dodo_subscription_id) {
    return res.status(400).json({ error: "No active subscription found" });
  }

  if (profile.subscription_status === "cancelled") {
    return res.status(400).json({ error: "Subscription is already cancelled" });
  }

  const subscriptionId = profile.dodo_subscription_id;

  // 3. Cancel on Dodo at end of billing period
  try {
    const dodoRes = await fetch(
      `${DODO_BASE_URL}/subscriptions/${subscriptionId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${DODO_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      },
    );

    if (!dodoRes.ok) {
      const err = await dodoRes.json().catch(() => ({}));
      console.error("[cancel-subscription] Dodo error:", err);
      return res.status(502).json({
        error: err.message || "Failed to cancel subscription with Dodo",
      });
    }

    // 4. Update Supabase profile
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${supabaseUser.id}`, {
      method: "PATCH",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        subscription_status: "cancelled",
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      }),
    });

    console.info(
      `[cancel-subscription] Cancelled subscription ${subscriptionId} for user ${supabaseUser.id}`,
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[cancel-subscription] Fatal:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
