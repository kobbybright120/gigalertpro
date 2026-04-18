// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/dodo-webhook
//
// Handles Dodo Payments subscription lifecycle events and keeps Supabase in sync.
//
// Events handled:
//   subscription.active         → activate subscription on Supabase profile
//   subscription.on_hold        → mark subscription as past_due
//   subscription.cancelled      → downgrade to free, mark cancelled
//   subscription.paused         → downgrade to free, mark cancelled
//   subscription.failed         → downgrade to free, mark cancelled
//   subscription.expired        → downgrade to free, clear subscription ID
//   subscription.renewed        → confirm active subscription
//   payment.failed              → downgrade to free, mark cancelled
//
// Required env vars (set in Vercel dashboard):
//   DODO_PAYMENTS_WEBHOOK_KEY  — webhook secret from Dodo dashboard
//   VITE_SUPABASE_URL          — your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  — service role key (NOT the anon key)
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "crypto";

const DODO_WEBHOOK_KEY = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Map Dodo product IDs to plan tiers
const PRODUCT_TO_PLAN = {
  [process.env.DODO_PRODUCT_BASIC]: "basic",
  [process.env.DODO_PRODUCT_BASIC_ANNUAL]: "basic_annual",
  [process.env.DODO_PRODUCT_PRO]: "pro",
  [process.env.DODO_PRODUCT_PRO_ANNUAL]: "pro_annual",
};

const VALID_PLANS = ["basic", "basic_annual", "pro", "pro_annual"];

function resolvePlan(data) {
  // Try product_id from the webhook event data
  const productId = data?.product_id || data?.items?.[0]?.product_id;
  if (productId && PRODUCT_TO_PLAN[productId]) {
    return PRODUCT_TO_PLAN[productId];
  }
  // Fallback: check metadata.tier set during checkout
  const tier = data?.metadata?.tier;
  if (tier && VALID_PLANS.includes(tier)) {
    return tier;
  }
  // Default to basic if we can't determine
  console.warn(
    "[dodo-webhook] Could not determine plan from event data, defaulting to basic",
  );
  return "basic";
}

// ── Dodo Payments signature verification (Standard Webhooks spec) ────────────
// Dodo uses the Standard Webhooks spec:
//   signed_content = `${webhook-id}.${webhook-timestamp}.${body}`
//   signature      = Base64( HMAC-SHA256( base64decode(secret), signed_content ) )
// The webhook-signature header may contain multiple signatures separated by spaces,
// each prefixed with "v1,".

function verifyDodoSignature(rawBody, headers) {
  if (!DODO_WEBHOOK_KEY) return false;

  const webhookId = headers["webhook-id"];
  const webhookTimestamp = headers["webhook-timestamp"];
  const webhookSignature = headers["webhook-signature"];

  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;

  // Reject events older than 5 minutes
  const ts = parseInt(webhookTimestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  // Build the signed content
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;

  // The webhook secret may be prefixed with "whsec_"
  const secretKey = DODO_WEBHOOK_KEY.startsWith("whsec_")
    ? DODO_WEBHOOK_KEY.slice(6)
    : DODO_WEBHOOK_KEY;

  const secretBytes = Buffer.from(secretKey, "base64");
  const computed = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // webhook-signature can contain multiple signatures: "v1,<sig1> v1,<sig2>"
  const signatures = webhookSignature.split(" ");
  for (const sig of signatures) {
    const parts = sig.split(",");
    if (parts[0] !== "v1") continue;
    const candidate = parts[1];
    try {
      const sigBuf = Buffer.from(candidate, "base64");
      const expBuf = Buffer.from(computed, "base64");
      if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

async function upsertProfileByEmail(email, fields, userId, { subscriptionId, customerId } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  let profileId = null;

  // 1. Prefer direct user ID lookup (always matches — it's the primary key)
  if (userId) {
    const idRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id`,
      { headers: supabaseHeaders() },
    );
    const idRows = await idRes.json().catch(() => []);
    profileId = idRows?.[0]?.id;
  }

  // 2. Lookup by dodo_subscription_id (reliable for lifecycle events like cancellations)
  if (!profileId && subscriptionId) {
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?dodo_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id`,
      { headers: supabaseHeaders() },
    );
    const subRows = await subRes.json().catch(() => []);
    profileId = subRows?.[0]?.id;
    if (profileId) {
      console.info(`[dodo-webhook] Found profile by subscription_id: ${subscriptionId}`);
    }
  }

  // 3. Lookup by dodo_customer_id
  if (!profileId && customerId) {
    const custRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?dodo_customer_id=eq.${encodeURIComponent(customerId)}&select=id`,
      { headers: supabaseHeaders() },
    );
    const custRows = await custRes.json().catch(() => []);
    profileId = custRows?.[0]?.id;
    if (profileId) {
      console.info(`[dodo-webhook] Found profile by customer_id: ${customerId}`);
    }
  }

  // 4. Fallback: lookup by email column
  if (!profileId && email) {
    const lookupRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`,
      { headers: supabaseHeaders() },
    );
    const rows = await lookupRes.json().catch(() => []);
    profileId = rows?.[0]?.id;
  }

  // 5. Last resort: query auth.users via Supabase admin API to find user by email
  if (!profileId && email) {
    try {
      const authRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
        },
      );
      const authData = await authRes.json().catch(() => ({}));
      const matchedUser = (authData?.users || []).find(
        (u) => u.email?.toLowerCase() === email.toLowerCase(),
      );
      if (matchedUser?.id) {
        profileId = matchedUser.id;
        // Backfill the email column so future lookups work
        await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${matchedUser.id}`,
          {
            method: "PATCH",
            headers: supabaseHeaders(),
            body: JSON.stringify({ email }),
          },
        );
      }
    } catch (err) {
      console.warn("[dodo-webhook] auth.users lookup failed:", err.message);
    }
  }

  if (!profileId) {
    console.warn(
      `[dodo-webhook] No profile found for email: ${email}, userId: ${userId}, subId: ${subscriptionId}, custId: ${customerId}`,
    );
    return;
  }

  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}`, {
    method: "PATCH",
    headers: supabaseHeaders(),
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Read raw body for signature verification
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");

  // Verify Dodo webhook signature
  if (!verifyDodoSignature(rawBody, req.headers)) {
    console.warn("[dodo-webhook] Invalid signature — rejected");
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { type: eventType, data } = event;
  console.info(`[dodo-webhook] Received event: ${eventType}`);

  try {
    // Prefer the auth_email from checkout metadata (matches Supabase profile)
    // Fall back to customer email from the payment form
    const email = data?.metadata?.auth_email || data?.customer?.email;
    const authUserId = data?.metadata?.auth_user_id || null;
    const subscriptionId = data?.subscription_id;
    const interval = data?.payment_frequency_interval; // "Month" | "Year"
    const period =
      interval === "Year" || interval === "year" ? "yearly" : "monthly";

    const customerId = data?.customer?.customer_id || null;

    // ── subscription.active ─────────────────────────────────────────────────
    if (eventType === "subscription.active") {
      const plan = resolvePlan(data);
      await upsertProfileByEmail(
        email,
        {
          plan,
          subscription_status: "active",
          billing_period: period,
          dodo_subscription_id: subscriptionId || null,
          dodo_customer_id: customerId,
          cancel_at_period_end: false,
          ...(email ? { email } : {}),
        },
        authUserId,
        { subscriptionId, customerId },
      );
      console.info(
        `[dodo-webhook] Activated ${plan} subscription for ${email} (uid: ${authUserId}, cust: ${customerId})`,
      );
    }

    // ── subscription.renewed ────────────────────────────────────────────────
    else if (eventType === "subscription.renewed") {
      await upsertProfileByEmail(
        email,
        {
          subscription_status: "active",
          billing_period: period,
          cancel_at_period_end: false,
        },
        authUserId,
        { subscriptionId, customerId },
      );
      console.info(`[dodo-webhook] Subscription renewed for ${email}`);
    }

    // ── subscription.on_hold ────────────────────────────────────────────────
    else if (eventType === "subscription.on_hold") {
      await upsertProfileByEmail(
        email,
        {
          subscription_status: "past_due",
        },
        authUserId,
        { subscriptionId, customerId },
      );
      console.warn(`[dodo-webhook] Subscription on hold for ${email}`);
    }

    // ── subscription.cancelled ──────────────────────────────────────────────
    else if (eventType === "subscription.cancelled") {
      await upsertProfileByEmail(
        email,
        {
          plan: "free",
          subscription_status: "cancelled",
          cancel_at_period_end: true,
        },
        authUserId,
        { subscriptionId, customerId },
      );
      console.info(`[dodo-webhook] Subscription cancelled for ${email}`);
    }

    // ── subscription.paused ─────────────────────────────────────────────────
    else if (eventType === "subscription.paused") {
      await upsertProfileByEmail(
        email,
        {
          plan: "free",
          subscription_status: "cancelled",
        },
        authUserId,
        { subscriptionId, customerId },
      );
      console.warn(`[dodo-webhook] Subscription paused for ${email}`);
    }

    // ── subscription.failed ─────────────────────────────────────────────────
    else if (eventType === "subscription.failed") {
      await upsertProfileByEmail(
        email,
        {
          plan: "free",
          subscription_status: "cancelled",
        },
        authUserId,
        { subscriptionId, customerId },
      );
      console.warn(`[dodo-webhook] Subscription failed for ${email}`);
    }

    // ── payment.failed ──────────────────────────────────────────────────────
    else if (eventType === "payment.failed") {
      await upsertProfileByEmail(
        email,
        {
          plan: "free",
          subscription_status: "cancelled",
        },
        authUserId,
        { subscriptionId, customerId },
      );
      console.warn(`[dodo-webhook] Payment failed for ${email}`);
    }

    // ── subscription.expired ────────────────────────────────────────────────
    else if (eventType === "subscription.expired") {
      await upsertProfileByEmail(
        email,
        {
          plan: "free",
          subscription_status: "cancelled",
          dodo_subscription_id: null,
          billing_period: null,
        },
        authUserId,
        { subscriptionId, customerId },
      );
      console.info(`[dodo-webhook] Subscription expired for ${email}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[dodo-webhook] Handler error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
