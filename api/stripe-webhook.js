// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/stripe-webhook
//
// Handles Stripe subscription lifecycle events and keeps Supabase in sync.
//
// Events handled:
//   checkout.session.completed      → activate subscription on Supabase profile
//   customer.subscription.updated   → update plan/status (e.g. payment → active)
//   customer.subscription.deleted   → downgrade to 'free' on cancellation
//
// Required env vars (set in Vercel dashboard):
//   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET      — whsec_... (from Stripe → Webhooks → signing secret)
//   VITE_SUPABASE_URL          — your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  — service role key (NOT the anon key)
// ─────────────────────────────────────────────────────────────────────────────

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Stripe signature verification (no SDK — raw crypto) ──────────────────────

import { createHmac, timingSafeEqual } from "crypto";

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=")),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject events older than 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    );
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

async function updateProfile(stripeCustomerId, fields) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  // Look up by stripe_customer_id
  const lookupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.${stripeCustomerId}&select=id`,
    { headers: supabaseHeaders() },
  );
  const rows = await lookupRes.json().catch(() => []);
  const userId = rows?.[0]?.id;
  if (!userId) {
    console.warn(
      `[webhook] No profile found for Stripe customer ${stripeCustomerId}`,
    );
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

  // Verify webhook signature
  if (STRIPE_WEBHOOK_SECRET) {
    const sig = req.headers["stripe-signature"];
    if (!verifyStripeSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET)) {
      console.warn("[webhook] Invalid Stripe signature");
      return res.status(400).json({ error: "Invalid signature" });
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  console.log(`[webhook] Event: ${event.type}`);

  try {
    switch (event.type) {
      // ── User completes checkout (subscription starts) ──
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") break;

        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const customerEmail = session.customer_details?.email;

        // Retrieve subscription to know the plan (monthly/yearly)
        const subRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
          { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
        );
        const sub = await subRes.json();
        const priceId = sub.items?.data?.[0]?.price?.id;
        const isYearly = priceId === process.env.STRIPE_PRICE_YEARLY;

        // Find user by email and link their Stripe customer ID
        if (SUPABASE_URL && SUPABASE_SERVICE_KEY && customerEmail) {
          // Look up user ID from auth.users via email
          const authRes = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(customerEmail)}`,
            {
              headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
              },
            },
          );
          const authData = await authRes.json().catch(() => null);
          const userId = authData?.users?.[0]?.id;

          if (userId) {
            await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
              method: "PATCH",
              headers: supabaseHeaders(),
              body: JSON.stringify({
                plan: "pro",
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                billing_period: isYearly ? "yearly" : "monthly",
                subscription_status: sub.status, // "active"
                updated_at: new Date().toISOString(),
              }),
            });
            console.log(`[webhook] Activated subscription for user ${userId}`);
          }
        }
        break;
      }

      // ── Subscription status changes (payment → active, payment failed, etc.) ──
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const priceId = sub.items?.data?.[0]?.price?.id;
        const isYearly = priceId === process.env.STRIPE_PRICE_YEARLY;

        await updateProfile(sub.customer, {
          subscription_status: sub.status,
          billing_period: isYearly ? "yearly" : "monthly",
          // If subscription is cancelled at period end, reflect that
          cancel_at_period_end: sub.cancel_at_period_end,
        });
        console.log(`[webhook] Updated subscription status to ${sub.status}`);
        break;
      }

      // ── Subscription fully cancelled ──
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await updateProfile(sub.customer, {
          plan: "free",
          subscription_status: "cancelled",
          stripe_subscription_id: null,
          billing_period: null,
        });
        console.log(
          `[webhook] Cancelled subscription for customer ${sub.customer}`,
        );
        break;
      }

      default:
        // Ignore other events
        break;
    }
  } catch (err) {
    console.error("[webhook] Handler error:", err.message);
    // Return 200 anyway so Stripe doesn't retry — log and fix separately
  }

  return res.status(200).json({ received: true });
}
