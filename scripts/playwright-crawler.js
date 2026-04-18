import fs from "fs/promises";
import { chromium } from "playwright";
import { notifyUsersOfNewGigs } from "./lib/email-notifier.js";

// Maximum age for Threads posts — anything older is stale
const MAX_AGE_DAYS = parseInt(process.env.THREADS_MAX_AGE_DAYS || "7", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

// ── Gig-post filter ──────────────────────────────────────────────────────
// Reject self-promo, advice, journey posts, and discussions.
// Keep only posts with actual hiring / gig signals.
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
  /\$\d/, // dollar amounts
  /\b\d+(?:k|K)\b/, // pay like "5k"
  /\bbudget\b/i,
  /\bper (?:hour|month|project|video|post|article)\b/i,
  /\b(?:paid|compensation|salary|stipend|retainer)\b/i,
  /\b(?:freelancer|contractor|agency) (?:needed|wanted|required)\b/i,
];

function isGigPost(text) {
  if (!text || text.length < 15) return false;
  // Hard reject self-promo / advice / journey posts
  for (const rx of REJECT_PATTERNS) {
    if (rx.test(text)) return false;
  }
  // Must have at least one hiring signal
  for (const rx of HIRING_SIGNALS) {
    if (rx.test(text)) return true;
  }
  return false;
}

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

async function crawlSeeds(seeds) {
  const browser = await chromium.launch({
    headless: process.env.PW_HEADLESS !== "false",
  });
  // Use a realistic browser UA — Threads blocks bot-like agents
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();
  const collected = [];

  // ── Dismiss the cookie consent wall that Threads now shows ──
  // Without this, the page shows a modal and zero post content loads.
  let cookiesDismissed = false;
  async function dismissCookieWall() {
    if (cookiesDismissed) return;
    try {
      // Look for common cookie consent buttons on Threads/Meta
      const selectors = [
        'button:has-text("Allow all cookies")',
        'button:has-text("Allow essential and optional cookies")',
        'button:has-text("Decline optional cookies")',
        'button:has-text("Accept all")',
        'button:has-text("Accept")',
        '[role="dialog"] button:first-of-type',
      ];
      for (const sel of selectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click();
          console.log("  → Dismissed cookie wall via:", sel);
          cookiesDismissed = true;
          await page.waitForTimeout(1500);
          return;
        }
      }
    } catch {
      /* no cookie wall — continue */
    }
  }

  for (const seed of seeds) {
    try {
      console.log("Visiting:", seed);
      await page.goto(seed, { waitUntil: "networkidle", timeout: 60000 });

      // Dismiss cookie/login wall (Threads added this — blocks all content)
      await dismissCookieWall();

      // Wait for posts to render (Threads loads content via AJAX)
      await page.waitForTimeout(2000 + Math.random() * 1500);

      // Check if we're stuck on a login wall (no article content visible)
      const hasContent = await page.evaluate(() => {
        return (
          document.querySelectorAll("article").length > 0 ||
          document.querySelectorAll('div[role="article"]').length > 0 ||
          document.querySelectorAll("div[data-pressable-container]").length > 0
        );
      });

      if (!hasContent) {
        // Try dismissing any remaining dialogs / overlays
        await page.evaluate(() => {
          // Close any visible modals by clicking backdrop or escape
          const dialogs = document.querySelectorAll('[role="dialog"]');
          dialogs.forEach((d) => d.remove());
          // Remove overlay divs that might block content
          const overlays = document.querySelectorAll(
            'div[style*="position: fixed"], div[style*="z-index"]',
          );
          overlays.forEach((o) => {
            if (o.querySelector("button")) o.remove();
          });
        });
        await page.waitForTimeout(2000);
      }

      // Scroll down to trigger lazy-loaded posts
      for (let scroll = 0; scroll < 3; scroll++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(800 + Math.random() * 400);
      }

      const pagePosts = await page.evaluate(() => {
        const out = [];

        // ── Find post containers — try multiple selectors (Threads changes DOM) ──
        let containers = Array.from(document.querySelectorAll("article"));
        if (containers.length === 0) {
          containers = Array.from(
            document.querySelectorAll(
              'div[role="article"], div[data-pressable-container]',
            ),
          );
        }
        // Fallback: Threads 2025+ uses nested divs with specific data attributes
        if (containers.length === 0) {
          containers = Array.from(
            document.querySelectorAll(
              '[data-testid="post-container"], [data-testid*="thread"]',
            ),
          );
        }
        // Last resort: find containers that have both a time element and text
        if (containers.length === 0) {
          const timeEls = document.querySelectorAll("time[datetime]");
          const parentSet = new Set();
          for (const t of timeEls) {
            // Walk up to find a meaningful container (3-5 levels up)
            let parent = t.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              if (
                parent.innerText &&
                parent.innerText.length > 20 &&
                !parentSet.has(parent)
              ) {
                parentSet.add(parent);
                break;
              }
              parent = parent.parentElement;
            }
          }
          containers = Array.from(parentSet);
        }

        if (containers.length > 0) {
          for (const el of containers.slice(0, 50)) {
            try {
              const timeEl = el.querySelector("time");
              const time = timeEl ? timeEl.getAttribute("datetime") : null;
              // Author: try multiple patterns
              const authorEl =
                el.querySelector('a[href*="/@"]') ||
                el.querySelector('a[href*="/profile/"]') ||
                el.querySelector("a");
              const author = authorEl ? authorEl.innerText.trim() : null;
              // Post text: div[dir="auto"] or spans with text content
              const textDivs = el.querySelectorAll(
                'div[dir="auto"], span[dir="auto"]',
              );
              let text = "";
              if (textDivs.length > 0) {
                for (const d of textDivs) {
                  const t = (d.innerText || "").replace(/\s+/g, " ").trim();
                  if (t.length > text.length) text = t;
                }
              } else {
                text = (el.innerText || "").replace(/\s+/g, " ").trim();
              }
              if (text.length < 10) continue;
              const linkEl =
                el.querySelector('a[href*="/post/"]') ||
                el.querySelector('a[href*="/status/"]') ||
                el.querySelector('a[href*="/@"]') ||
                el.querySelector("a");
              const url = linkEl ? linkEl.href : window.location.href;
              out.push({
                title: text.slice(0, 120),
                body_preview: text.slice(0, 400),
                author,
                posted_at: time,
                url,
              });
            } catch (e) {
              /* ignore */
            }
          }
        }

        // Fallback: meta tags (single post page or no articles found)
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
          const time =
            document.querySelector("time")?.getAttribute("datetime") || null;
          if (description.length >= 10) {
            out.push({
              title: title.slice(0, 120),
              body_preview: description.slice(0, 400),
              author:
                document.querySelector('meta[name="author"]')?.content || null,
              posted_at: time,
              url: window.location.href,
            });
          }
        }

        return out;
      });

      collected.push(...pagePosts);
      console.log(`  → ${pagePosts.length} posts extracted`);

      // Diagnostic: if 0 posts, log what's on the page to help debug
      if (pagePosts.length === 0) {
        const diag = await page.evaluate(() => ({
          url: window.location.href,
          title: document.title,
          hasLoginBtn: !!document.querySelector('a[href*="/login"]'),
          hasCookieDialog: !!document.querySelector('[role="dialog"]'),
          articleCount: document.querySelectorAll("article").length,
          divArticleCount: document.querySelectorAll('[role="article"]').length,
          timeCount: document.querySelectorAll("time").length,
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

async function main() {
  try {
    const raw = await fs.readFile(
      new URL("./threads-seeds.json", import.meta.url),
      "utf-8",
    );
    const seeds = JSON.parse(raw || "[]");
    if (!Array.isArray(seeds) || seeds.length === 0) {
      console.error(
        "No seeds configured. Edit scripts/threads-seeds.json to add Threads URLs to crawl.",
      );
      process.exit(1);
    }

    console.log(`Crawling ${seeds.length} Threads seed URLs...`);
    const posts = await crawlSeeds(seeds);

    // ── 1. Gig-only filter — reject self-promo and non-job posts ──
    const gigs = posts.filter((p) => {
      const text = (p.title || "") + " " + (p.body_preview || "");
      return isGigPost(text);
    });
    if (gigs.length < posts.length) {
      console.log(
        `Gig filter: kept ${gigs.length}/${posts.length} posts (rejected ${posts.length - gigs.length} non-gig posts)`,
      );
    }

    // ── 2. Freshness filter — drop stale & undated posts ──
    const now = Date.now();
    const fresh = gigs.filter((p) => {
      if (!p.posted_at) return false; // reject posts without timestamps
      const d = new Date(p.posted_at);
      if (isNaN(d.getTime())) return false;
      return now - d.getTime() < MAX_AGE_MS;
    });
    if (fresh.length < gigs.length) {
      console.log(
        `Freshness filter: kept ${fresh.length}/${gigs.length} posts (dropped ${gigs.length - fresh.length} stale/undated)`,
      );
    }

    // Deduplicate by url
    const map = new Map();
    for (const p of fresh) {
      const key = (p.url || "") + "::" + (p.posted_at || "");
      const id = encodeId(key);
      if (!map.has(id)) map.set(id, { id, ...p });
    }

    const results = Array.from(map.values());
    const payload = JSON.stringify({
      posts: results,
      post_count: results.length,
      cached_at: new Date().toISOString(),
      feed: "threads-playwright",
    });

    console.log(
      `Payload: ${results.length} posts, ${(payload.length / 1024).toFixed(1)} KB`,
    );

    // TTL 9000s (2.5 hours) — covers the 2h cron interval with buffer
    await redisSet("gigalertpro:threads:latest", payload, 9000);
    console.log(
      `Wrote ${results.length} threads posts to Upstash (key: gigalertpro:threads:latest, TTL 2.5h)`,
    );

    // ── Email notifications for premium users ──
    try {
      if (results.length > 0) {
        const { url: redisUrl, token: redisToken } = getUpstashCredentials();
        await notifyUsersOfNewGigs(results, "Threads", {
          redisUrl,
          redisToken,
        });
      }
    } catch (err) {
      console.warn(
        "[threads-crawler] Email notification error (non-fatal):",
        err.message,
      );
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
