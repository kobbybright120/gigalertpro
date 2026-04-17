// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Facebook Public Group/Page Crawler
//
// Scrapes public Facebook groups and pages for freelance gig posts.
// No login required — reads publicly visible content only.
// Uses Playwright to handle JS-rendered content, scrolling, and overlays.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { classifyAndFilter } from "./gig-classifier.js";

const MAX_AGE_DAYS = parseInt(process.env.FB_MAX_AGE_DAYS || "7", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

// ── Public Facebook groups and pages to scrape ──────────────────────────────
// These are publicly accessible without login.

const SEED_URLS = [
  // Freelance hiring groups
  "https://www.facebook.com/groups/freelancejobposting/",
  "https://www.facebook.com/groups/remotejobsanywhere/",
  "https://www.facebook.com/groups/graphicdesignjobsworldwide/",
  "https://www.facebook.com/groups/webdeveloperjobs/",
  "https://www.facebook.com/groups/hireafreelancer/",
  "https://www.facebook.com/groups/freelancewritinggigs/",
  "https://www.facebook.com/groups/virtualassistantjobs/",
  "https://www.facebook.com/groups/socialmediamarketingjobs/",
  "https://www.facebook.com/groups/uxuidesignjobs/",
  "https://www.facebook.com/groups/videoeditingjobs/",
  "https://www.facebook.com/groups/remoteworkers/",
  "https://www.facebook.com/groups/digitalnomadsjobs/",
  "https://www.facebook.com/groups/contentwritingjobs/",
  "https://www.facebook.com/groups/saborfreelance/",
  "https://www.facebook.com/groups/freelancersunion/",
  // Public pages that post gigs
  "https://www.facebook.com/remotejobshq/",
  "https://www.facebook.com/freelancermap/",
  "https://www.facebook.com/weworkremotely/",
];

// ── Gig-post filter ─────────────────────────────────────────────────────────

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

// ── Upstash Redis helpers ───────────────────────────────────────────────────

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

async function redisCommand(...args) {
  const { url, token } = getUpstashCredentials();
  if (!url || !token) return null;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  return json.result;
}

async function redisGet(key) {
  return redisCommand("GET", key);
}

async function redisSet(key, value, ttlSeconds) {
  return redisCommand("SET", key, value, "EX", ttlSeconds);
}

async function redisSadd(key, ...members) {
  return redisCommand("SADD", key, ...members);
}

async function redisSmembers(key) {
  return redisCommand("SMEMBERS", key);
}

async function redisExpire(key, ttl) {
  return redisCommand("EXPIRE", key, ttl);
}

function encodeId(str) {
  try {
    return Buffer.from(str).toString("base64url");
  } catch {
    return encodeURIComponent(str).slice(0, 64);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(minMs, maxMs) {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

// ── Facebook relative timestamp parser ──────────────────────────────────────

function parseFBTimestamp(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const now = Date.now();

  if (t === "just now" || t === "now") return Math.floor(now / 1000);

  let m = t.match(/^(\d+)\s*m(?:in(?:ute)?s?)?\s*(?:ago)?$/);
  if (m) return Math.floor((now - parseInt(m[1]) * 60 * 1000) / 1000);

  m = t.match(/^(\d+)\s*h(?:(?:ou)?rs?)?\s*(?:ago)?$/);
  if (m) return Math.floor((now - parseInt(m[1]) * 3600 * 1000) / 1000);

  m = t.match(/^(\d+)\s*d(?:ays?)?\s*(?:ago)?$/);
  if (m) return Math.floor((now - parseInt(m[1]) * 86400 * 1000) / 1000);

  m = t.match(/^yesterday/);
  if (m) {
    const timeMatch = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    const d = new Date(now - 86400 * 1000);
    if (timeMatch) {
      let hrs = parseInt(timeMatch[1]);
      if (timeMatch[3]?.toLowerCase() === "pm" && hrs < 12) hrs += 12;
      if (timeMatch[3]?.toLowerCase() === "am" && hrs === 12) hrs = 0;
      d.setHours(hrs, parseInt(timeMatch[2]), 0, 0);
    }
    return Math.floor(d.getTime() / 1000);
  }

  const parsed = new Date(text.trim());
  if (!isNaN(parsed.getTime())) return Math.floor(parsed.getTime() / 1000);

  return null;
}

// ── Post extraction from a loaded page ──────────────────────────────────────

async function extractPosts(page) {
  return page.evaluate(() => {
    const out = [];

    // Try multiple container selectors
    let containers = Array.from(document.querySelectorAll('div[role="article"]'));
    if (containers.length === 0) {
      containers = Array.from(document.querySelectorAll('div[data-pagelet^="FeedUnit_"]'));
    }
    if (containers.length === 0) {
      const feed = document.querySelector('div[role="feed"]');
      if (feed) {
        containers = Array.from(feed.querySelectorAll(":scope > div")).filter(
          (d) => d.innerText && d.innerText.length > 30,
        );
      }
    }
    if (containers.length === 0) {
      const main = document.querySelector('div[role="main"]');
      if (main) {
        containers = Array.from(main.querySelectorAll('div[class]:has(div[dir="auto"])')).filter(
          (d) => d.innerText && d.innerText.length > 30,
        );
      }
    }
    // Last resort: find containers near time-like elements
    if (containers.length === 0) {
      const allSpans = document.querySelectorAll("span");
      const parentSet = new Set();
      for (const span of allSpans) {
        const t = (span.innerText || "").trim();
        if (/^\d+[mhd]$|^just now$|^yesterday/i.test(t)) {
          let parent = span.parentElement;
          for (let i = 0; i < 8 && parent; i++) {
            if (parent.innerText && parent.innerText.length > 50 && !parentSet.has(parent)) {
              parentSet.add(parent);
              break;
            }
            parent = parent.parentElement;
          }
        }
      }
      containers = Array.from(parentSet);
    }

    for (const article of containers.slice(0, 30)) {
      try {
        // Post text
        const textDivs = article.querySelectorAll('div[dir="auto"], span[dir="auto"]');
        let text = "";
        for (const d of textDivs) {
          const t = (d.innerText || "").replace(/\s+/g, " ").trim();
          if (t.length > text.length) text = t;
        }
        if (!text) {
          text = (article.innerText || "").replace(/\s+/g, " ").trim();
        }
        if (!text || text.length < 15) continue;

        // Author
        let author = null;
        const authorEl =
          article.querySelector("h2 a strong") ||
          article.querySelector("h3 a strong") ||
          article.querySelector("h4 a strong") ||
          article.querySelector('a[role="link"] > strong') ||
          article.querySelector("strong");
        if (authorEl) author = authorEl.innerText.trim();

        // Timestamp
        let timeText = null;
        const timeLinks = article.querySelectorAll('a[role="link"]');
        for (const link of timeLinks) {
          const label = link.getAttribute("aria-label") || "";
          const inner = (link.innerText || "").trim();
          if (
            /^\d+[mhd]$|^just now$|^yesterday|^\w+ \d+/i.test(inner) ||
            /^\d+[mhd]$|^just now$|^yesterday/i.test(label)
          ) {
            timeText = inner || label;
            break;
          }
        }
        if (!timeText) {
          const abbr = article.querySelector("abbr[data-utime]");
          if (abbr) timeText = abbr.getAttribute("data-utime");
        }
        if (!timeText) {
          const spans = article.querySelectorAll("span");
          for (const span of spans) {
            const t = (span.innerText || "").trim();
            if (/^\d+[mhd]$|^\d+ (?:min|hour|day)/i.test(t)) {
              timeText = t;
              break;
            }
          }
        }

        // Post URL
        let postUrl = null;
        const allLinks = article.querySelectorAll("a[href]");
        for (const link of allLinks) {
          const href = link.getAttribute("href") || "";
          if (
            href.includes("/posts/") ||
            href.includes("/permalink/") ||
            href.includes("story_fbid") ||
            href.includes("/videos/") ||
            href.includes("/photos/")
          ) {
            postUrl = href.startsWith("http")
              ? href
              : "https://www.facebook.com" + href;
            break;
          }
        }
        if (!postUrl) {
          for (const link of timeLinks) {
            const href = link.getAttribute("href") || "";
            if (href && href !== "#" && !href.includes("/search/")) {
              postUrl = href.startsWith("http")
                ? href
                : "https://www.facebook.com" + href;
              break;
            }
          }
        }

        out.push({
          text,
          author,
          timeText,
          postUrl: postUrl || window.location.href,
        });
      } catch {
        /* skip broken container */
      }
    }

    return out;
  });
}

// ── Main crawler ────────────────────────────────────────────────────────────

async function main() {
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
  const allPosts = [];
  const sourceStats = {};
  let cookiesDismissed = false;

  // ── Dismiss cookie/login walls ──
  async function dismissOverlays() {
    // Cookie consent
    if (!cookiesDismissed) {
      try {
        const selectors = [
          'button[data-cookiebanner="accept_button"]',
          'button:has-text("Allow all cookies")',
          'button:has-text("Accept All")',
          'button:has-text("Allow essential and optional cookies")',
          'button:has-text("Accept")',
          '[data-testid="cookie-policy-manage-dialog-accept-button"]',
        ];
        for (const sel of selectors) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
            await btn.click();
            console.log("  → Dismissed cookie wall");
            cookiesDismissed = true;
            await sleep(1500);
            break;
          }
        }
      } catch {
        /* no cookie wall */
      }
    }

    // Login modal / "Not now" dialogs
    try {
      const dismissSelectors = [
        'div[role="dialog"] a[href="#"]:has-text("Not Now")',
        'div[role="dialog"] button:has-text("Not Now")',
        'div[role="dialog"] button:has-text("Close")',
        '[aria-label="Close"]',
      ];
      for (const sel of dismissSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click();
          console.log("  → Dismissed login/overlay dialog");
          await sleep(1000);
          break;
        }
      }
    } catch {
      /* no dialog */
    }

    // Brute-force remove blocking overlays
    await page.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      dialogs.forEach((d) => d.remove());
      const overlays = document.querySelectorAll(
        'div[style*="position: fixed"], div[style*="z-index: 9"]',
      );
      overlays.forEach((o) => {
        if (o.querySelector("button") || o.querySelector("a")) o.remove();
      });
      document.body.style.overflow = "auto";
    });
  }

  try {
    // ── 1. Load seen set for dedup ──
    const SEEN_KEY = "gigalertpro:seen:facebook";
    const seenRaw = await redisSmembers(SEEN_KEY);
    const seenSet = new Set(seenRaw || []);
    console.log(`Seen set: ${seenSet.size} previously seen posts`);

    // ── 2. Visit each public group/page and collect posts ──
    let totalExtracted = 0;

    for (let i = 0; i < SEED_URLS.length; i++) {
      const seedUrl = SEED_URLS[i];
      const sourceName = seedUrl.replace(/https:\/\/www\.facebook\.com\//, "").replace(/\/$/, "");

      try {
        console.log(`[${i + 1}/${SEED_URLS.length}] Visiting: ${sourceName}`);
        await page.goto(seedUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        await sleep(3000);
        await dismissOverlays();

        // Wait for content to appear
        await page
          .waitForSelector(
            'div[role="article"], div[role="feed"], div[role="main"], div[data-pagelet^="FeedUnit_"]',
            { timeout: 15000 },
          )
          .catch(() => {});

        await sleep(2000);
        await dismissOverlays();

        // Scroll to trigger lazy loading
        let prevHeight = 0;
        for (let s = 0; s < 5; s++) {
          await page.keyboard.press("PageDown");
          await sleep(800);
          await page.evaluate(() => window.scrollBy(0, 800));
          await sleep(1200 + Math.random() * 800);
          const newHeight = await page.evaluate(() => document.body.scrollHeight);
          if (newHeight === prevHeight && s > 1) break;
          prevHeight = newHeight;
        }

        // Scroll back to top
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(500);

        // Debug: on first page, log what we see
        if (i === 0) {
          console.log("  [debug] URL:", page.url());
          const debugInfo = await page.evaluate(() => {
            const articles = document.querySelectorAll('div[role="article"]');
            const feed = document.querySelectorAll('div[role="feed"]');
            const allDivs = document.querySelectorAll("div[role]");
            const roles = [...new Set(Array.from(allDivs).map((d) => d.getAttribute("role")))];
            return {
              articleCount: articles.length,
              feedCount: feed.length,
              roles: roles.slice(0, 20),
              title: document.title,
              bodyText: (document.body?.innerText || "").slice(0, 300),
            };
          });
          console.log("  [debug] Articles:", debugInfo.articleCount, "| Feed divs:", debugInfo.feedCount);
          console.log("  [debug] Roles:", debugInfo.roles.join(", "));
          console.log("  [debug] Title:", debugInfo.title);
          console.log("  [debug] Body preview:", debugInfo.bodyText.slice(0, 200));
          await page.screenshot({ path: "fb-search-debug.png", fullPage: false });
        }

        const posts = await extractPosts(page);
        sourceStats[sourceName] = posts.length;
        totalExtracted += posts.length;

        for (const p of posts) {
          allPosts.push({ ...p, source: sourceName });
        }

        console.log(`  → ${posts.length} posts extracted`);
      } catch (err) {
        console.warn(`  ✗ Failed for "${sourceName}":`, err.message);
        sourceStats[sourceName] = 0;
      }

      // Anti-ban delay between pages
      if (i < SEED_URLS.length - 1) {
        await randomDelay(3000, 7000);
      }
    }

    await browser.close();
    console.log(`\nTotal raw posts extracted: ${totalExtracted}`);

    // ── 3. Deduplicate ──
    const deduped = new Map();
    for (const p of allPosts) {
      const key = p.postUrl || p.text.slice(0, 100);
      const id = "fb_" + encodeId(key);
      if (!deduped.has(id)) {
        deduped.set(id, { id, ...p });
      }
    }
    const uniquePosts = Array.from(deduped.values());
    console.log(`After dedup: ${uniquePosts.length} unique posts`);

    // ── 4. Regex gig filter ──
    const gigPosts = uniquePosts.filter((p) => isGigPost(p.text));
    console.log(
      `Gig filter: kept ${gigPosts.length}/${uniquePosts.length} (rejected ${uniquePosts.length - gigPosts.length} non-gig)`,
    );

    // ── 5. Parse timestamps and freshness filter ──
    const now = Date.now();
    const freshPosts = [];
    let staleCount = 0;

    for (const p of gigPosts) {
      const createdUtc = parseFBTimestamp(p.timeText);
      if (!createdUtc) {
        p.created_utc = Math.floor(now / 1000);
        freshPosts.push(p);
        continue;
      }
      p.created_utc = createdUtc;
      if (now - createdUtc * 1000 < MAX_AGE_MS) {
        freshPosts.push(p);
      } else {
        staleCount++;
      }
    }
    if (staleCount > 0) {
      console.log(`Freshness filter: dropped ${staleCount} stale posts`);
    }

    // ── 6. Split new vs already-seen ──
    const newPosts = [];
    const existingPosts = [];

    for (const p of freshPosts) {
      if (seenSet.has(p.id)) {
        existingPosts.push(p);
      } else {
        newPosts.push(p);
      }
    }
    console.log(`New: ${newPosts.length}, Previously seen: ${existingPosts.length}`);

    // ── 7. AI classify new posts ──
    let classifiedNew = newPosts;
    if (newPosts.length > 0) {
      const forClassifier = newPosts.map((p) => ({
        id: p.id,
        name: p.id,
        title: p.text.slice(0, 120),
        selftext: p.text.slice(0, 2000),
        author: p.author || "unknown",
      }));

      const classified = await classifyAndFilter(forClassifier);
      const classifiedIds = new Set(classified.map((c) => c.id));
      classifiedNew = newPosts.filter((p) => classifiedIds.has(p.id));

      console.log(`AI filter: kept ${classifiedNew.length}/${newPosts.length} new posts`);

      if (newPosts.length > 0) {
        const ids = newPosts.map((p) => p.id);
        await redisSadd(SEEN_KEY, ...ids);
        await redisExpire(SEEN_KEY, 86400);
      }
    }

    // ── 8. Normalize to pipeline schema ──
    const finalPosts = [...classifiedNew, ...existingPosts].map((p) => ({
      id: p.id,
      name: p.id,
      title: (p.text || "").slice(0, 120),
      selftext: (p.text || "").slice(0, 2000),
      author: p.author || "unknown",
      author_name: p.author || "unknown",
      permalink: p.postUrl || "",
      subreddit: null,
      created_utc: p.created_utc || Math.floor(Date.now() / 1000),
      num_comments: 0,
      ups: 0,
      link_flair_text: p.source || null,
      _sub: "facebook",
      source: `fb-group-${(p.source || "").replace(/\s+/g, "-").toLowerCase()}`,
      source_platform: "Facebook",
      _ai_is_gig: true,
    }));

    finalPosts.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

    // ── 9. Store to Redis ──
    const payload = JSON.stringify({
      posts: finalPosts.slice(0, 300),
      post_count: Math.min(finalPosts.length, 300),
      cached_at: new Date().toISOString(),
      feed: "facebook-playwright",
      sources: { facebook: finalPosts.length },
    });

    await redisSet("gigalertpro:facebook:latest", payload, 7200);
    console.log(
      `\nStored ${Math.min(finalPosts.length, 300)} posts to Redis (key: gigalertpro:facebook:latest, TTL 2h)`,
    );

    // ── 10. Terminal metrics ──
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║         FACEBOOK CRAWLER RESULTS             ║");
    console.log("╠══════════════════════════════════════════════╣");
    console.log(
      `║ Sources scraped       │ ${SEED_URLS.length.toString().padStart(6)}`,
    );
    console.log(
      `║ Raw posts extracted   │ ${totalExtracted.toString().padStart(6)}`,
    );
    console.log(
      `║ After dedup           │ ${uniquePosts.length.toString().padStart(6)}`,
    );
    console.log(
      `║ After gig filter      │ ${gigPosts.length.toString().padStart(6)}`,
    );
    console.log(
      `║ After freshness       │ ${freshPosts.length.toString().padStart(6)}`,
    );
    console.log(
      `║ New (AI classified)   │ ${classifiedNew.length.toString().padStart(6)}`,
    );
    console.log(
      `║ Previously seen       │ ${existingPosts.length.toString().padStart(6)}`,
    );
    console.log(
      `║ Final stored          │ ${Math.min(finalPosts.length, 300).toString().padStart(6)}`,
    );
    console.log("╚══════════════════════════════════════════════╝");

    // Top sources by result count
    const sorted = Object.entries(sourceStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (sorted.length > 0) {
      console.log("\nTop sources:");
      for (const [src, count] of sorted) {
        console.log(`  ${count.toString().padStart(3)} │ ${src}`);
      }
    }

    // Sample posts
    if (finalPosts.length > 0) {
      console.log("\nSample posts:");
      for (const p of finalPosts.slice(0, 10)) {
        const age =
          p.created_utc > 0
            ? `${Math.round((Date.now() / 1000 - p.created_utc) / 3600)}h ago`
            : "unknown";
        console.log(
          `  [${age}] ${p.title.slice(0, 80)}... — ${p.author || "?"} — ${p.permalink.slice(0, 50)}`,
        );
      }
    }
  } catch (err) {
    try {
      await page.screenshot({ path: "fb-error-screenshot.png", fullPage: false });
      console.log("Screenshot saved to fb-error-screenshot.png");
      console.log("Page URL at failure:", page.url());
      const title = await page.title().catch(() => "unknown");
      console.log("Page title at failure:", title);
    } catch {
      /* ignore screenshot errors */
    }
    await browser.close().catch(() => {});
    console.error("Facebook crawler failed:", err.message || err);
    process.exit(1);
  }
}

main();
