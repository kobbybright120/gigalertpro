// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Email Notification Module
//
// Shared module imported by all crawler scripts. After new gigs are stored
// in Redis, this module:
//   1. Fetches premium users with email notifications enabled
//   2. Matches gigs against each user's keywords (via goldLeadScorer)
//   3. Sends HTML email alerts via Resend REST API
//   4. Deduplicates to prevent re-sending the same gig
//   5. Enforces a 30-minute per-user cooldown
//
// Uses only fetch() — no npm packages required.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac } from "crypto";
import { scoreGoldLead } from "../../src/lib/goldLeadScorer.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCORE_THRESHOLD = 50;
const PLAN_COOLDOWN_MS = {
  basic: 30 * 60 * 1000, // 30 minutes
  basic_annual: 30 * 60 * 1000,
  pro: 10 * 60 * 1000, // 10 minutes (priority scanning)
  pro_annual: 10 * 60 * 1000,
};

const PLAN_DAILY_GIG_LIMITS = {
  basic: 25,
  basic_annual: 25,
  pro: Infinity,
  pro_annual: Infinity,
};
const MAX_GIGS_PER_EMAIL = 3;
const DEDUP_TTL = 172_800; // 48 hours in seconds
const FROM_EMAIL = "GigAlertPro <notifications@gigalertpro.com>";
const APP_URL = "https://gigalertpro.com";
const PAID_PLANS = ["basic", "basic_annual", "pro", "pro_annual"];

// ── Supabase REST helpers ────────────────────────────────────────────────────

function svcHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function fetchPremiumUsers() {
  const params = new URLSearchParams({
    select: "id,email,plan,last_emailed_at,email_notification_count",
    email_notifications_enabled: "is.true",
    email: "not.is.null",
    plan: `in.(${PAID_PLANS.join(",")})`,
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${params}`, {
    headers: svcHeaders(),
  });
  if (!res.ok) {
    console.warn("[email-notifier] Failed to fetch users:", res.status);
    return [];
  }
  return res.json();
}

async function fetchUserKeywords(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/keywords?user_id=eq.${encodeURIComponent(userId)}&select=keyword`,
    { headers: svcHeaders() },
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.map((r) => r.keyword);
}

async function updateLastEmailed(userId, count) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { ...svcHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({
        last_emailed_at: new Date().toISOString(),
        email_notification_count: count,
      }),
    },
  );
}

// ── Redis helpers ────────────────────────────────────────────────────────────

async function redisCmd(redisUrl, redisToken, cmd) {
  const res = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.result;
}

async function getEmailedGigIds(redisUrl, redisToken, userId) {
  const result = await redisCmd(redisUrl, redisToken, [
    "SMEMBERS",
    `gigalertpro:emailed:${userId}`,
  ]);
  return new Set(Array.isArray(result) ? result : []);
}

async function markGigsEmailed(redisUrl, redisToken, userId, gigIds) {
  if (gigIds.length === 0) return;
  const key = `gigalertpro:emailed:${userId}`;
  await redisCmd(redisUrl, redisToken, ["SADD", key, ...gigIds]);
  await redisCmd(redisUrl, redisToken, ["EXPIRE", key, DEDUP_TTL]);
}

// ── Daily gig cap (tracked in Redis, resets at midnight UTC) ────────────────

function dailyGigKey(userId) {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  return `gigalertpro:daily-gigs:${userId}:${today}`;
}

async function getDailyGigCount(redisUrl, redisToken, userId) {
  const result = await redisCmd(redisUrl, redisToken, [
    "GET",
    dailyGigKey(userId),
  ]);
  return result ? parseInt(result, 10) : 0;
}

async function incrementDailyGigCount(redisUrl, redisToken, userId, count) {
  const key = dailyGigKey(userId);
  await redisCmd(redisUrl, redisToken, ["INCRBY", key, count]);
  await redisCmd(redisUrl, redisToken, [
    "EXPIREAT",
    key,
    secondsUntilMidnightUtc(),
  ]);
}

function secondsUntilMidnightUtc() {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.floor(midnight.getTime() / 1000); // Unix timestamp of next midnight UTC
}

// ── Unsubscribe URL ──────────────────────────────────────────────────────────

function generateUnsubscribeUrl(userId) {
  const sig = createHmac("sha256", SUPABASE_SERVICE_KEY)
    .update(userId)
    .digest("hex");
  return `${APP_URL}/api/unsubscribe-email?uid=${encodeURIComponent(userId)}&sig=${sig}`;
}

// ── Normalize gig fields ─────────────────────────────────────────────────────

function normalizeGig(gig) {
  return {
    ...gig,
    body_preview:
      gig.body_preview || gig.selftext || gig.text || gig.body || "",
    title: gig.title || "",
    url: gig.url || gig.permalink || "",
  };
}

// ── Platform badge colors ────────────────────────────────────────────────────

const PLATFORM_COLORS = {
  Reddit: { bg: "#FF4500", text: "#fff" },
  X: { bg: "#000", text: "#fff" },
  Craigslist: { bg: "#5a0e8f", text: "#fff" },
  Threads: { bg: "#000", text: "#fff" },
  Facebook: { bg: "#1877F2", text: "#fff" },
  LinkedIn: { bg: "#0A66C2", text: "#fff" },
};

// ── HTML Email Template ──────────────────────────────────────────────────────

export function buildEmailHtml(gigs, unsubscribeUrl) {
  const gigCards = gigs
    .map((g) => {
      const colors = PLATFORM_COLORS[g._platform] || {
        bg: "#444",
        text: "#fff",
      };
      const budget = g.extracted_budget || "";
      const preview = (g.body_preview || "").slice(0, 200).trim();
      const score = g.quality_score || 0;
      const scoreColor =
        score >= 80 ? "#00F0B5" : score >= 60 ? "#FFD700" : "#FF8C00";
      const gigUrl = g.url || g.permalink || `${APP_URL}/gig-alerts`;

      return `
      <div style="background:#0B1120;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="display:inline-block;background:${colors.bg};color:${colors.text};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:0.5px;">${g._platform}</span>
          ${budget ? `<span style="color:#00F0B5;font-size:12px;font-weight:600;">${budget}</span>` : ""}
          <span style="margin-left:auto;color:${scoreColor};font-size:12px;font-weight:700;">Score: ${score}</span>
        </div>
        <h3 style="margin:0 0 8px;color:#fff;font-size:16px;font-weight:700;line-height:1.4;">
          <a href="${gigUrl}" style="color:#fff;text-decoration:none;">${g.title || "New Gig"}</a>
        </h3>
        ${preview ? `<p style="margin:0 0 16px;color:#94a3b8;font-size:13px;line-height:1.6;">${preview}${preview.length >= 200 ? "..." : ""}</p>` : ""}
        <a href="${APP_URL}/gig-alerts" style="display:inline-block;background:#00F0B5;color:#020617;font-size:13px;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;">View Gig &amp; Generate Proposal</a>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="margin:0;color:#00F0B5;font-size:24px;font-weight:800;letter-spacing:-0.5px;">GigAlertPro</h1>
      <p style="margin:6px 0 0;color:#64748b;font-size:13px;">New gig${gigs.length > 1 ? "s" : ""} matching your keywords</p>
    </div>

    <!-- Gig Cards -->
    ${gigCards}

    <!-- CTA -->
    <div style="text-align:center;margin:28px 0;">
      <a href="${APP_URL}/gig-alerts" style="display:inline-block;background:#00F0B5;color:#020617;font-size:15px;font-weight:800;padding:14px 40px;border-radius:10px;text-decoration:none;box-shadow:0 0 20px rgba(0,240,181,0.2);">View All Gigs &amp; Generate Proposals</a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);">
      <p style="color:#475569;font-size:11px;margin:0 0 8px;">
        You're receiving this because you have email notifications enabled on GigAlertPro.
      </p>
      <a href="${unsubscribeUrl}" style="color:#64748b;font-size:11px;text-decoration:underline;">Unsubscribe from email notifications</a>
    </div>

  </div>
</body>
</html>`;
}

// ── Send email via Resend REST API ───────────────────────────────────────────

async function sendEmail(to, subject, html, unsubscribeUrl) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.warn(`[email-notifier] Resend error (${res.status}):`, err);
    return false;
  }

  const data = await res.json().catch(() => ({}));
  console.info(`[email-notifier] Email sent: ${data.id || "ok"} → ${to}`);
  return true;
}

// ── Main exported function ───────────────────────────────────────────────────

/**
 * Notify premium users about newly found gigs via email.
 *
 * @param {Object[]} freshGigs - Array of new gigs from this crawler run
 * @param {string} platform - Source platform name (Reddit, X, Craigslist, Threads, Facebook, LinkedIn)
 * @param {Object} redis - { redisUrl, redisToken }
 */
export async function notifyUsersOfNewGigs(
  freshGigs,
  platform,
  { redisUrl, redisToken },
) {
  if (!RESEND_API_KEY) {
    console.info("[email-notifier] RESEND_API_KEY not set — skipping emails");
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.info(
      "[email-notifier] Supabase credentials not set — skipping emails",
    );
    return;
  }
  if (!freshGigs || freshGigs.length === 0) {
    return;
  }

  console.info(
    `[email-notifier] Processing ${freshGigs.length} new ${platform} gigs for email notifications...`,
  );

  // 1. Fetch premium users with email notifications enabled
  const users = await fetchPremiumUsers();
  if (users.length === 0) {
    console.info("[email-notifier] No eligible users — done");
    return;
  }
  console.info(`[email-notifier] ${users.length} eligible user(s) found`);

  // 2. Normalize gigs for scoring
  const normalizedGigs = freshGigs.map((g) => ({
    ...normalizeGig(g),
    _platform: platform,
  }));

  let totalSent = 0;
  let totalSkipped = 0;

  // 3. Process each user
  for (const user of users) {
    try {
      // 3a. Check plan-based cooldown
      const cooldownMs = PLAN_COOLDOWN_MS[user.plan] ?? 30 * 60 * 1000;
      if (user.last_emailed_at) {
        const elapsed = Date.now() - new Date(user.last_emailed_at).getTime();
        if (elapsed < cooldownMs) {
          console.debug(
            `[email-notifier] User ${user.id} in cooldown (${Math.round(elapsed / 60000)}m elapsed)`,
          );
          totalSkipped++;
          continue;
        }
      }

      // 3b. Check plan-based daily gig cap
      const gigLimit = PLAN_DAILY_GIG_LIMITS[user.plan] ?? 0;
      const dailyGigCount =
        gigLimit === Infinity
          ? 0
          : await getDailyGigCount(redisUrl, redisToken, user.id);
      if (dailyGigCount >= gigLimit) {
        console.debug(
          `[email-notifier] User ${user.id} hit daily gig cap (${dailyGigCount}/${gigLimit})`,
        );
        totalSkipped++;
        continue;
      }

      // 3d. Fetch user's keywords
      const keywords = await fetchUserKeywords(user.id);
      if (keywords.length === 0) {
        console.debug(
          `[email-notifier] User ${user.id} has no keywords, skipping`,
        );
        continue;
      }

      // 3e. Score gigs against this user's keywords
      const scored = normalizedGigs
        .map((gig) => {
          const result = scoreGoldLead(gig, keywords);
          return { ...gig, ...result };
        })
        .filter((g) => g.quality_score >= SCORE_THRESHOLD);

      if (scored.length === 0) {
        console.debug(
          `[email-notifier] No gigs scored >= ${SCORE_THRESHOLD} for user ${user.id} (keywords: ${keywords.join(", ")})`,
        );
        continue;
      }

      // 3f. Filter out already-emailed gigs
      const emailedIds = await getEmailedGigIds(redisUrl, redisToken, user.id);
      const unsent = scored.filter((g) => !emailedIds.has(String(g.id)));
      if (unsent.length === 0) {
        console.debug(
          `[email-notifier] All ${scored.length} matching gigs already emailed to user ${user.id}`,
        );
        continue;
      }

      // 3g. Pick top gigs by score, clamped to remaining daily quota
      unsent.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
      const remaining =
        gigLimit === Infinity
          ? MAX_GIGS_PER_EMAIL
          : Math.min(MAX_GIGS_PER_EMAIL, gigLimit - dailyGigCount);
      const topGigs = unsent.slice(0, remaining);

      // 3h. Build and send email
      const unsubUrl = generateUnsubscribeUrl(user.id);
      const subject =
        topGigs.length === 1
          ? `New ${platform} gig: ${topGigs[0].title.slice(0, 60)}`
          : `${topGigs.length} new ${platform} gigs matching your keywords`;
      const html = buildEmailHtml(topGigs, unsubUrl);

      const sent = await sendEmail(user.email, subject, html, unsubUrl);

      if (sent) {
        totalSent++;
        // 3i. Update Supabase + Redis dedup + daily gig count
        await updateLastEmailed(
          user.id,
          (user.email_notification_count || 0) + 1,
        );
        await markGigsEmailed(
          redisUrl,
          redisToken,
          user.id,
          topGigs.map((g) => String(g.id)),
        );
        if (gigLimit !== Infinity) {
          await incrementDailyGigCount(
            redisUrl,
            redisToken,
            user.id,
            topGigs.length,
          );
        }
      }
    } catch (err) {
      console.warn(
        `[email-notifier] Error processing user ${user.id}:`,
        err.message,
      );
    }
  }

  console.info(
    `[email-notifier] Done. Sent: ${totalSent}, Skipped: ${totalSkipped}`,
  );
}
