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
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "GigAlertPro <notifications@gigalertpro.com>";
const APP_URL = "https://gigalertpro.com";

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

// ── Welcome email on subscription activation ─────────────────────────────────

async function sendWelcomeEmail(email, name) {
  if (!RESEND_API_KEY) return;
  const displayName = name || "there";
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:28px;">
      <h1 style="margin:0;color:#00F0B5;font-size:24px;font-weight:800;letter-spacing:-0.5px;">GigAlertPro</h1>
    </div>
    <div style="background:#0B1120;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:28px;">
      <p style="color:#fff;font-size:16px;font-weight:700;margin:0 0 16px;">Hey ${displayName},</p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:0 0 16px;">Welcome to GigAlertPro! We're already scanning Reddit, X, Threads, Craigslist, Facebook and LinkedIn for gigs matching your skills.</p>
      <div style="background:rgba(0,240,181,0.08);border:1px solid rgba(0,240,181,0.15);border-radius:10px;padding:16px;margin:0 0 20px;">
        <p style="color:#00F0B5;font-size:14px;font-weight:700;margin:0 0 6px;">🛡️ 3-Day Money Back Guarantee</p>
        <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0;">If GigAlertPro doesn't find you relevant gigs, just reply to this email and we'll refund you completely. No questions asked.</p>
      </div>
      <p style="color:#fff;font-size:14px;font-weight:600;margin:0 0 12px;">Here's what to do right now:</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#94a3b8;font-size:14px;line-height:1.6;vertical-align:top;"><span style="color:#00F0B5;font-weight:700;margin-right:8px;">1.</span> <a href="${APP_URL}/gig-alerts" style="color:#00F0B5;text-decoration:none;">Log in</a> and make sure your keywords are set correctly</td></tr>
        <tr><td style="padding:8px 0;color:#94a3b8;font-size:14px;line-height:1.6;vertical-align:top;"><span style="color:#00F0B5;font-weight:700;margin-right:8px;">2.</span> Enable email notifications in your <a href="${APP_URL}/profile" style="color:#00F0B5;text-decoration:none;">profile</a> so you get alerted instantly</td></tr>
        <tr><td style="padding:8px 0;color:#94a3b8;font-size:14px;line-height:1.6;vertical-align:top;"><span style="color:#00F0B5;font-weight:700;margin-right:8px;">3.</span> Check back in a few hours to see what we found for you</td></tr>
      </table>
      <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:24px 0 0;">We're rooting for you.</p>
      <p style="color:#fff;font-size:14px;font-weight:600;margin:8px 0 0;">Kobby</p>
      <p style="color:#64748b;font-size:12px;margin:2px 0 0;">Founder, GigAlertPro</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: "Welcome to GigAlertPro — your 3-day guarantee starts now",
        html,
        reply_to: "support@gigalertpro.com",
      }),
    });
    if (res.ok) {
      console.info(`[dodo-webhook] Welcome email sent to ${email}`);
    } else {
      const err = await res.text().catch(() => "unknown");
      console.warn(`[dodo-webhook] Welcome email failed (${res.status}): ${err}`);
    }
  } catch (err) {
    console.warn("[dodo-webhook] Welcome email error:", err.message);
  }
}

async function fetchUserName(email) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !email) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=name`,
      { headers: supabaseHeaders() },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.name || null;
  } catch {
    return null;
  }
}

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

      // Send welcome email with 3-day guarantee reminder
      try {
        const userName = await fetchUserName(email);
        await sendWelcomeEmail(email, userName);
      } catch (err) {
        console.warn("[dodo-webhook] Welcome email failed (non-fatal):", err.message);
      }
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
    // Fired immediately when user cancels. Keep plan active — user has paid
    // for the rest of the billing period. subscription.expired fires at
    // period end and will downgrade to free then.
    else if (eventType === "subscription.cancelled") {
      await upsertProfileByEmail(
        email,
        {
          subscription_status: "cancelled",
          cancel_at_period_end: true,
        },
        authUserId,
        { subscriptionId, customerId },
      );
      console.info(`[dodo-webhook] Subscription cancelled for ${email} — access retained until period end`);
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
