import fs from "fs/promises";
import { chromium } from "playwright";

// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Facebook Gig Crawler (Playwright)
//
// Scrapes Facebook public post search results for job/gig posts.
// Facebook is fully CSR — requires headless browser like Threads/Instagram.
//
// Stores results in Upstash Redis for the x-feed API to merge & serve.
// Runs via GitHub Actions cron (every 2 hours).
// ─────────────────────────────────────────────────────────────────────────────

const MAX_AGE_DAYS = parseInt(process.env.FB_MAX_AGE_DAYS || "7", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;
const REDIS_KEY = "gigalertpro:facebook:latest";
const REDIS_TTL = 9000; // 2.5 hours

// ── Gig-post filter (shared pattern) ─────────────────────────────────────────
const REJECT_PATTERNS = [
  /\bi(?:'| a)?m a (?:freelanc|designer|developer|writer|creator|editor|VA|marketer)/i,
  /\bmy (?:freelanc|UGC|design|dev|writing|editing) journey/i,
  /\bjust started (?:my|freelanc|UGC)/i,
  /\bfollow (?:me|us|my page)/i,
  /\bcheck out my (?:portfolio|work|page|website|profile)/i,
  /\bhere(?:'s| is) my (?:portfolio|work|showreel)/i,
  /\bopen for (?:collabs|collaborations|work|commissions)/i,
  /\bavailable for (?:hire|projects|work|bookings)/i,
  /\bI offer (?:services|freelanc)/i,
  /\btips for (?:freelanc|new |beginner)/i,
  /\bhow I (?:got|landed|started|grew|built)/i,
  /\bwho else (?:is|feels|thinks)/i,
  /\bany (?:tips|advice|recommendations)\b/i,
  /\bwhat tools? do you/i,
  /\bfollow for (?:more|daily|weekly)/i,
  /\blet me introduce myself/i,
  /\bintroduction post/i,
  /\brate my (?:portfolio|work|reel|website)/i,
  /\bsharing my (?:journey|experience|story)/i,
  /\bday \d+ of/i,
];

const HIRING_SIGNALS = [
  /\b(?:hiring|looking for(?: a)?|need(?: a)?|seeking|wanted|searching for)\b/i,
  /\b(?:DM (?:me|us|if)|send (?:your |me )?(?:portfolio|samples|resume|CV|rates?))/i,
  /\b(?:apply|submit|deadline|position|role|opening|gig|project|contract|remote (?:job|position|role))\b/i,
  /\$\d/,
  /\b\d+(?:k|K)\b/,
  /\bbudget\b/i,
  /\bper (?:hour|month|project|video|post|article)\b/i,
  /\b(?:paid|compensation|salary|stipend|retainer)\b/i,
  /\b(?:freelancer|contractor|agency) (?:needed|wanted|required)\b/i,
];

function isGigPost(text) {
  if (!text || text.length < 15) return false;
  for (const rx of REJECT_PATTERNS) {
    if (rx.test(text)) return false;
  }
  for (const rx of HIRING_SIGNALS) {
    if (rx.test(text)) return true;
  }
  return false;
}

// ── Upstash Redis helpers ────────────────────────────────────────────────────

function getUpstashCredentials() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
  return { url, token };
}

async function redisSet(key, value, ttlSeconds = 3600) {
  const { url, token } = getUpstashCredentials();
  if (!url || !token) {
    console.warn("Upstash credentials not configured; skipping write");
    return;
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", key, value, "EX", ttlSeconds]),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Redis SET failed: ${resp.status} — ${body}`);
  }
  const result = await resp.json();
  console.log("Redis SET result:", JSON.stringify(result));
  return result;
}

function encodeId(str) {
  try {
    return Buffer.from(str).toString("base64url");
  } catch {
    return encodeURIComponent(str).slice(0, 64);
  }
}

// ── Playwright crawler ───────────────────────────────────────────────────────

async function crawlSeeds(seeds) {
  const browser = await chromium.launch({
    headless: process.env.PW_HEADLESS !== "false",
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();
  const collected = [];

  // ── Dismiss cookie/login walls (Meta pattern) ──
  let cookiesDismissed = false;
  async function dismissDialogs() {
    if (cookiesDismissed) return;
    try {
      const selectors = [
        'button:has-text("Allow all cookies")',
        'button:has-text("Allow essential and optional cookies")',
        'button:has-text("Decline optional cookies")',
        'button:has-text("Accept all")',
        'button:has-text("Accept All")',
        'button:has-text("Accept")',
        'button:has-text("Not Now")',
        'button:has-text("Not now")',
        'button:has-text("Close")',
        '[data-cookiebanner="accept_button"]',
        '[data-testid="cookie-policy-manage-dialog-accept-button"]',
        '[role="dialog"] button:first-of-type',
      ];
      for (const sel of selectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click();
          console.log("  → Dismissed dialog via:", sel);
          cookiesDismissed = true;
          await page.waitForTimeout(1500);
          return;
        }
      }
    } catch {
      /* no dialog — continue */
    }
  }

  for (const seed of seeds) {
    try {
      console.log("Visiting:", seed);
      await page.goto(seed, { waitUntil: "domcontentloaded", timeout: 20000 });
      await dismissDialogs();

      // Early bail-out: Facebook redirected us to login
      if (
        page.url().includes("/login") ||
        page.url().includes("/checkpoint") ||
        page.url().includes("login.php")
      ) {
        console.warn("  ⚠ Login wall detected — skipping");
        continue;
      }

      // Wait for content to render
      await page.waitForTimeout(2000 + Math.random() * 1500);

      // Dismiss login modals Facebook frequently shows to non-logged-in users
      await page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        dialogs.forEach((d) => {
          const text = d.innerText || "";
          if (
            text.includes("Log in") ||
            text.includes("Sign Up") ||
            text.includes("Log In") ||
            text.includes("Create new account")
          ) {
            d.remove();
          }
        });
        const overlays = document.querySelectorAll(
          'div[style*="position: fixed"]',
        );
        overlays.forEach((o) => {
          if (
            o.querySelector("button") &&
            (o.innerText || "").includes("Log")
          ) {
            o.remove();
          }
        });
      });
      await page.waitForTimeout(1000);

      // Scroll to load more posts
      for (let scroll = 0; scroll < 4; scroll++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1000 + Math.random() * 500);
      }

      const pagePosts = await page.evaluate(() => {
        const out = [];

        // Facebook search results show posts in feed format
        // Each post is typically a div[role="article"] or inside feed containers
        let containers = Array.from(
          document.querySelectorAll('div[role="article"]'),
        );
        if (containers.length === 0) {
          containers = Array.from(
            document.querySelectorAll(
              'div[data-ad-comet-preview], div[data-testid="Keycommand_wrapper_feed"]',
            ),
          );
        }
        // Fallback: find divs that look like post containers
        if (containers.length === 0) {
          containers = Array.from(
            document.querySelectorAll(
              'div[class*="feed"] > div, div[data-pagelet*="FeedUnit"]',
            ),
          );
        }

        if (containers.length > 0) {
          for (const el of containers.slice(0, 50)) {
            try {
              // Author name — Facebook uses h2/h3/h4 with links for author names
              const authorEl =
                el.querySelector("h2 a, h3 a, h4 a") ||
                el.querySelector('a[role="link"] strong') ||
                el.querySelector("strong");
              const author = authorEl ? authorEl.innerText.trim() : null;

              // Timestamp
              const timeEl =
                el.querySelector("abbr[data-utime]") ||
                el.querySelector("span[id] a[href*='permalink']") ||
                el.querySelector("a[href*='/posts/']");
              const rawTime = timeEl
                ? timeEl.getAttribute("data-utime") ||
                  timeEl.getAttribute("title") ||
                  null
                : null;

              // Post text — Facebook stores post text in div[dir="auto"] spans
              const textEls = el.querySelectorAll(
                'div[dir="auto"], span[dir="auto"]',
              );
              let text = "";
              for (const t of textEls) {
                const content = (t.innerText || "").replace(/\s+/g, " ").trim();
                if (content.length > text.length) text = content;
              }
              // Fallback
              if (!text || text.length < 10) {
                const dataDiv = el.querySelector(
                  'div[data-ad-preview="message"]',
                );
                if (dataDiv)
                  text = (dataDiv.innerText || "").replace(/\s+/g, " ").trim();
              }

              if (!text || text.length < 10) continue;

              // Post URL
              const linkEl =
                el.querySelector('a[href*="/posts/"]') ||
                el.querySelector('a[href*="permalink"]') ||
                el.querySelector('a[href*="/groups/"]');
              const url = linkEl ? linkEl.href : window.location.href;

              let posted_at = null;
              if (rawTime && /^\d+$/.test(rawTime)) {
                posted_at = new Date(
                  parseInt(rawTime, 10) * 1000,
                ).toISOString();
              }

              out.push({
                title: text.slice(0, 120),
                body_preview: text.slice(0, 400),
                author,
                posted_at,
                url,
              });
            } catch {
              /* ignore */
            }
          }
        }

        // Fallback: meta tags
        if (out.length === 0) {
          const title =
            document.querySelector('meta[property="og:title"]')?.content ||
            document.title ||
            "";
          const description =
            document.querySelector('meta[property="og:description"]')
              ?.content || "";
          if (description.length >= 10) {
            out.push({
              title: title.slice(0, 120),
              body_preview: description.slice(0, 400),
              author: null,
              posted_at: null,
              url: window.location.href,
            });
          }
        }

        return out;
      });

      collected.push(...pagePosts);
      console.log(`  → ${pagePosts.length} posts extracted`);

      if (pagePosts.length === 0) {
        const diag = await page.evaluate(() => ({
          url: window.location.href,
          title: document.title,
          hasLoginBtn: !!document.querySelector('a[href*="/login"]'),
          hasDialog: !!document.querySelector('[role="dialog"]'),
          articleCount: document.querySelectorAll('[role="article"]').length,
          bodySnippet: document.body?.innerText?.slice(0, 200) || "",
        }));
        console.warn("  ⚠ 0 posts — page state:", JSON.stringify(diag));
      }
    } catch (err) {
      console.warn("Seed error:", seed, err.message || err);
    }
  }

  await browser.close();
  return collected;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    const raw = await fs.readFile(
      new URL("./facebook-seeds.json", import.meta.url),
      "utf-8",
    );
    const seeds = JSON.parse(raw || "[]");
    if (!Array.isArray(seeds) || seeds.length === 0) {
      console.error(
        "No seeds configured. Edit scripts/facebook-seeds.json to add Facebook URLs.",
      );
      process.exit(1);
    }

    console.log(`Crawling ${seeds.length} Facebook seed URLs...`);
    const posts = await crawlSeeds(seeds);

    // ── 1. Gig-only filter ──
    const gigs = posts.filter((p) => {
      const text = (p.title || "") + " " + (p.body_preview || "");
      return isGigPost(text);
    });
    if (gigs.length < posts.length) {
      console.log(
        `Gig filter: kept ${gigs.length}/${posts.length} posts (rejected ${posts.length - gigs.length} non-gig posts)`,
      );
    }

    // ── 2. Freshness filter ──
    const now = Date.now();
    const fresh = gigs.filter((p) => {
      if (!p.posted_at) return true; // keep posts without timestamps (FB doesn't always expose them)
      const d = new Date(p.posted_at);
      if (isNaN(d.getTime())) return true;
      return now - d.getTime() < MAX_AGE_MS;
    });
    if (fresh.length < gigs.length) {
      console.log(
        `Freshness filter: kept ${fresh.length}/${gigs.length} posts (dropped ${gigs.length - fresh.length} stale)`,
      );
    }

    // Deduplicate by url
    const map = new Map();
    for (const p of fresh) {
      const key = (p.url || "") + "::" + (p.posted_at || "");
      const id = "fb_" + encodeId(key);
      if (!map.has(id))
        map.set(id, { id, _sub: "facebook", source: "facebook-search", ...p });
    }

    const results = Array.from(map.values());
    const payload = JSON.stringify({
      posts: results,
      post_count: results.length,
      cached_at: new Date().toISOString(),
      feed: "facebook-playwright",
    });

    console.log(
      `Payload: ${results.length} posts, ${(payload.length / 1024).toFixed(1)} KB`,
    );

    await redisSet(REDIS_KEY, payload, REDIS_TTL);
    console.log(
      `Wrote ${results.length} Facebook posts to Upstash (key: ${REDIS_KEY}, TTL 2.5h)`,
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
