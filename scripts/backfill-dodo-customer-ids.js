#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// One-time backfill: populate dodo_customer_id (and dodo_subscription_id if
// missing) on existing profiles for users who paid before the fix.
//
// Usage:
//   node scripts/backfill-dodo-customer-ids.js
//
// Required env vars (copy from your Vercel dashboard or .env.local):
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   DODO_PAYMENTS_API_KEY
//   DODO_PAYMENTS_ENVIRONMENT   (optional — defaults to "live_mode")
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DODO_API_KEY = process.env.DODO_PAYMENTS_API_KEY;
const DODO_ENV = process.env.DODO_PAYMENTS_ENVIRONMENT || "live_mode";
const DODO_BASE_URL =
  DODO_ENV === "test_mode"
    ? "https://test.dodopayments.com"
    : "https://live.dodopayments.com";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !DODO_API_KEY) {
  console.error(
    "Missing required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DODO_PAYMENTS_API_KEY",
  );
  process.exit(1);
}

const supabaseHeaders = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

const dodoHeaders = {
  Authorization: `Bearer ${DODO_API_KEY}`,
  "Content-Type": "application/json",
};

// ── 1. Fetch all subscriptions from Dodo ─────────────────────────────────────
async function fetchDodoSubscriptions() {
  const res = await fetch(`${DODO_BASE_URL}/subscriptions`, {
    headers: dodoHeaders,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dodo /subscriptions failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data?.items || data?.data || [];
}

// ── 2. Fetch all paid profiles from Supabase ─────────────────────────────────
async function fetchPaidProfiles() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?subscription_status=eq.active&select=id,email,dodo_customer_id,dodo_subscription_id`,
    { headers: supabaseHeaders },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase profiles fetch failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── 3. Patch a single profile ─────────────────────────────────────────────────
async function patchProfile(profileId, fields) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}`,
    {
      method: "PATCH",
      headers: supabaseHeaders,
      body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PATCH failed for ${profileId} (${res.status}): ${text}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("Fetching subscriptions from Dodo…");
  const subscriptions = await fetchDodoSubscriptions();
  console.log(`  Found ${subscriptions.length} subscriptions in Dodo`);

  console.log("Fetching active profiles from Supabase…");
  const profiles = await fetchPaidProfiles();
  console.log(`  Found ${profiles.length} active profiles in Supabase`);

  // Build lookup: email → Dodo subscription
  const dodoByEmail = new Map();
  const dodoBySubId = new Map();
  for (const sub of subscriptions) {
    const email =
      sub?.metadata?.auth_email?.toLowerCase() ||
      sub?.customer?.email?.toLowerCase();
    const subId = sub?.subscription_id;
    if (email) dodoByEmail.set(email, sub);
    if (subId) dodoBySubId.set(subId, sub);
  }

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const profile of profiles) {
    // Skip if already has customer id
    if (profile.dodo_customer_id) {
      skipped++;
      continue;
    }

    // Try to match Dodo subscription by existing sub ID or email
    let match =
      (profile.dodo_subscription_id &&
        dodoBySubId.get(profile.dodo_subscription_id)) ||
      (profile.email && dodoByEmail.get(profile.email.toLowerCase()));

    if (!match) {
      console.warn(
        `  ⚠ No Dodo subscription found for profile ${profile.id} (${profile.email || "no email"})`,
      );
      notFound++;
      continue;
    }

    const custId = match?.customer?.customer_id || null;
    const subId = match?.subscription_id || null;

    if (!custId) {
      console.warn(
        `  ⚠ Dodo sub found but no customer_id for profile ${profile.id}`,
      );
      notFound++;
      continue;
    }

    const fields = { dodo_customer_id: custId };
    // Also backfill subscription_id if missing
    if (!profile.dodo_subscription_id && subId) {
      fields.dodo_subscription_id = subId;
    }

    await patchProfile(profile.id, fields);
    console.log(
      `  ✅ Updated ${profile.email || profile.id}  →  customer_id: ${custId}${fields.dodo_subscription_id ? `  sub_id: ${subId}` : ""}`,
    );
    updated++;
  }

  console.log("\n── Summary ─────────────────────────────────────");
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped (already had ID): ${skipped}`);
  console.log(`  Not matched in Dodo: ${notFound}`);
  console.log("Done.");
})().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
