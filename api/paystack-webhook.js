// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/paystack-webhook
//
// Handles Paystack subscription lifecycle events and keeps Supabase in sync.
//
// Events handled:
//   charge.success              → activate subscription on Supabase profile
//   subscription.create         → record subscription details
//   subscription.disable        → mark subscription as cancelled
//   invoice.payment_failed      → mark subscription as past_due
//
// Required env vars (set in Vercel dashboard):
//   PAYSTACK_SECRET_KEY        — sk_test_... or sk_live_...
//   VITE_SUPABASE_URL          — your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  — service role key (NOT the anon key)
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "crypto";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Paystack signature verification ──────────────────────────────────────────
// Paystack signs with HMAC-SHA512 of the raw request body using the secret key.
// The signature is sent in the x-paystack-signature header.

function verifyPaystackSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !PAYSTACK_SECRET_KEY) return false;
  try {
    const expected = createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");
    // timingSafeEqual requires equal-length buffers
    const sigBuf = Buffer.from(signatureHeader, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
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

async function upsertProfileByEmail(email, fields) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  // Look up profile by email
  const lookupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`,
    { headers: supabaseHeaders() },
  );
  const rows = await lookupRes.json().catch(() => []);
  const userId = rows?.[0]?.id;

  if (!userId) {
    console.warn(`[paystack-webhook] No profile found for email: ${email}`);
    return;
  }

  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
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

  // Verify Paystack signature
  const signature = req.headers["x-paystack-signature"];
  if (!verifyPaystackSignature(rawBody, signature)) {
    console.warn("[paystack-webhook] Invalid signature — rejected");
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { event: eventType, data } = event;
  console.info(`[paystack-webhook] Received event: ${eventType}`);

  try {
    // ── charge.success ────────────────────────────────────────────────────────
    // Fired when a payment is successfully charged (first payment or renewal).
    if (eventType === "charge.success") {
      const email = data?.customer?.email;
      const subscriptionCode = data?.subscription?.subscription_code;
      const plan = data?.plan || {};
      const period = plan.interval === "annually" ? "yearly" : "monthly";

      if (email) {
        await upsertProfileByEmail(email, {
          subscription_status: "active",
          billing_period: period,
          stripe_subscription_id: subscriptionCode || null, // reuse column for Paystack sub code
          cancel_at_period_end: false,
        });
        console.info(`[paystack-webhook] Activated subscription for ${email}`);
      }
    }

    // ── subscription.create ───────────────────────────────────────────────────
    // Fired when a new subscription is created (after the first charge).
    else if (eventType === "subscription.create") {
      const email = data?.customer?.email;
      const subscriptionCode = data?.subscription_code;
      const plan = data?.plan || {};
      const period = plan.interval === "annually" ? "yearly" : "monthly";

      if (email) {
        await upsertProfileByEmail(email, {
          subscription_status: "active",
          billing_period: period,
          stripe_subscription_id: subscriptionCode || null,
          cancel_at_period_end: false,
        });
        console.info(`[paystack-webhook] Subscription created for ${email}`);
      }
    }

    // ── subscription.disable ─────────────────────────────────────────────────
    // Fired when a subscription is cancelled or disabled.
    else if (eventType === "subscription.disable") {
      const email = data?.customer?.email;

      if (email) {
        await upsertProfileByEmail(email, {
          subscription_status: "cancelled",
          cancel_at_period_end: true,
        });
        console.info(`[paystack-webhook] Subscription cancelled for ${email}`);
      }
    }

    // ── invoice.payment_failed ────────────────────────────────────────────────
    // Fired when a recurring charge fails.
    else if (eventType === "invoice.payment_failed") {
      const email = data?.customer?.email;

      if (email) {
        await upsertProfileByEmail(email, {
          subscription_status: "past_due",
        });
        console.warn(
          `[paystack-webhook] Payment failed (past_due) for ${email}`,
        );
      }
    }

    // Acknowledge all other events without error
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[paystack-webhook] Handler error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
