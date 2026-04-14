import fs from "fs/promises";
import { chromium } from "playwright";

// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Instagram Gig Crawler (Playwright)
//
// Scrapes Instagram hashtag explore pages for job/gig posts.
// Instagram is fully CSR — requires headless browser like Threads.
//
// Stores results in Upstash Redis for the x-feed API to merge & serve.
// Runs via GitHub Actions cron (every 2 hours).
// ─────────────────────────────────────────────────────────────────────────────

const MAX_AGE_DAYS = parseInt(process.env.IG_MAX_AGE_DAYS || "7", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;
const REDIS_KEY = "gigalertpro:instagram:latest";
const REDIS_TTL = 9000; // 2.5 hours — covers 2h cron interval with buffer

// ── Gig-post filter (shared with Threads pattern) ────────────────────────────
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
        'button:has-text("Accept")',
        'button:has-text("Not Now")',
        'button:has-text("Not now")',
        'button:has-text("Close")',
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

      // Early bail-out: Instagram redirected us to the login page
      if (page.url().includes("/accounts/login") || page.url().includes("/accounts/signup")) {
        console.warn("  ⚠ Login wall detected — skipping");
        collected; // already empty, just skip
        continue;
      }

      // Wait for content to render
      await page.waitForTimeout(2000 + Math.random() * 1500);

      // Dismiss login modals that Instagram frequently shows
      await page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        dialogs.forEach((d) => {
          // Only remove login/signup prompts, not content dialogs
          const text = d.innerText || "";
          if (
            text.includes("Log in") ||
            text.includes("Sign up") ||
            text.includes("Log In")
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

      // Scroll to trigger lazy-loaded posts
      for (let scroll = 0; scroll < 3; scroll++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(800 + Math.random() * 400);
      }

      const pagePosts = await page.evaluate(() => {
        const out = [];

        // Instagram explore/hashtag pages show a grid of posts
        // Each post is an article or a link wrapping an image
        let containers = Array.from(document.querySelectorAll("article"));
        if (containers.length === 0) {
          containers = Array.from(
            document.querySelectorAll(
              'div[role="article"], div[data-testid="post-container"]',
            ),
          );
        }

        // Instagram grid: each cell has an anchor with aria-label or alt text
        if (containers.length === 0) {
          // Fallback: look for post links with descriptive alt text on images
          const imgLinks = document.querySelectorAll('a[href*="/p/"] img');
          for (const img of imgLinks) {
            const alt = img.getAttribute("alt") || "";
            if (alt.length > 10) {
              const anchor = img.closest("a");
              const href = anchor ? anchor.href : "";
              out.push({
                title: alt.slice(0, 120),
                body_preview: alt.slice(0, 400),
                author: null,
                posted_at: null,
                url: href || window.location.href,
              });
            }
          }
        }

        // Try article containers
        if (containers.length > 0 && out.length === 0) {
          for (const el of containers.slice(0, 50)) {
            try {
              const timeEl = el.querySelector("time");
              const time = timeEl ? timeEl.getAttribute("datetime") : null;
              const authorEl =
                el.querySelector('a[href*="/"] span') ||
                el.querySelector("header a");
              const author = authorEl ? authorEl.innerText.trim() : null;
              // Post caption text
              const captionEl = el.querySelector(
                'div[dir="auto"], span[dir="auto"], ul li span',
              );
              let text = "";
              if (captionEl) {
                text = (captionEl.innerText || "").replace(/\s+/g, " ").trim();
              }
              if (!text || text.length < 10) {
                // Try alt text from images
                const img = el.querySelector("img[alt]");
                if (img) text = img.getAttribute("alt") || "";
              }
              if (text.length < 10) continue;
              const linkEl =
                el.querySelector('a[href*="/p/"]') ||
                el.querySelector('a[href*="/reel/"]');
              const url = linkEl ? linkEl.href : window.location.href;
              out.push({
                title: text.slice(0, 120),
                body_preview: text.slice(0, 400),
                author,
                posted_at: time,
                url,
              });
            } catch {
              /* ignore */
            }
          }
        }

        // Fallback: meta tags (single post page)
        if (out.length === 0) {
          const title =
            document.querySelector('meta[property="og:title"]')?.content ||
            document.querySelector('meta[name="twitter:title"]')?.content ||
            document.title ||
            "";
          const description =
            document.querySelector('meta[property="og:description"]')
              ?.content ||
            document.querySelector('meta[name="twitter:description"]')
              ?.content ||
            "";
          if (description.length >= 10) {
            out.push({
              title: title.slice(0, 120),
              body_preview: description.slice(0, 400),
              author:
                document.querySelector('meta[name="author"]')?.content || null,
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
          hasLoginBtn: !!document.querySelector('a[href*="/accounts/login"]'),
          hasDialog: !!document.querySelector('[role="dialog"]'),
          articleCount: document.querySelectorAll("article").length,
          imgCount: document.querySelectorAll('a[href*="/p/"] img').length,
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
      new URL("./instagram-seeds.json", import.meta.url),
      "utf-8",
    );
    const seeds = JSON.parse(raw || "[]");
    if (!Array.isArray(seeds) || seeds.length === 0) {
      console.error(
        "No seeds configured. Edit scripts/instagram-seeds.json to add Instagram URLs.",
      );
      process.exit(1);
    }

    console.log(`Crawling ${seeds.length} Instagram seed URLs...`);
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
      if (!p.posted_at) return true; // keep posts without timestamps (IG grid doesn't always show dates)
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
      const id = "ig_" + encodeId(key);
      if (!map.has(id))
        map.set(id, {
          id,
          _sub: "instagram",
          source: "instagram-hashtag",
          ...p,
        });
    }

    const results = Array.from(map.values());
    const payload = JSON.stringify({
      posts: results,
      post_count: results.length,
      cached_at: new Date().toISOString(),
      feed: "instagram-playwright",
    });

    console.log(
      `Payload: ${results.length} posts, ${(payload.length / 1024).toFixed(1)} KB`,
    );

    await redisSet(REDIS_KEY, payload, REDIS_TTL);
    console.log(
      `Wrote ${results.length} Instagram posts to Upstash (key: ${REDIS_KEY}, TTL 2.5h)`,
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
