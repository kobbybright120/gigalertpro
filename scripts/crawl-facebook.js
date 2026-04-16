// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Facebook Playwright Crawler
//
// Logs into Facebook with a dedicated account, searches for freelance gig
// keywords, extracts posts, filters with regex + AI, and stores to Redis.
// Session cookies persist in Redis so we only log in once.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { classifyAndFilter } from "./gig-classifier.js";

const MAX_AGE_DAYS = parseInt(process.env.FB_MAX_AGE_DAYS || "7", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

const FB_EMAIL = process.env.FB_EMAIL || "";
const FB_PASSWORD = process.env.FB_PASSWORD || "";

// ── Search keywords (covering major freelance niches) ────────────────────────

const SEARCH_KEYWORDS = [
  "hiring video editor",
  "hiring graphic designer",
  "hiring web developer",
  "looking for a freelancer",
  "need a designer",
  "need a developer",
  "hiring virtual assistant",
  "looking for copywriter",
  "hiring social media manager",
  "need a video editor",
  "freelance opportunity",
  "need a wordpress developer",
  "hiring content writer",
  "looking for SEO expert",
  "need a logo designer",
  "hiring data entry",
  "looking for photographer",
  "need an animator",
  "hiring illustrator",
  "looking for UI/UX designer",
  "hiring shopify developer",
  "need a react developer",
  "hiring bookkeeper",
  "looking for translator",
  "hiring voiceover artist",
  "need email marketing",
  "hiring podcast editor",
  "looking for app developer",
  "need a brand designer",
  "hiring video producer",
];

// ── Gig-post filter (reused from Threads crawler) ────────────────────────────

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

// ── Facebook relative timestamp parser ───────────────────────────────────────

function parseFBTimestamp(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const now = Date.now();

  if (t === "just now" || t === "now") return Math.floor(now / 1000);

  // "Xm" or "X min" or "X mins ago"
  let m = t.match(/^(\d+)\s*m(?:in(?:ute)?s?)?\s*(?:ago)?$/);
  if (m) return Math.floor((now - parseInt(m[1]) * 60 * 1000) / 1000);

  // "Xh" or "X hr" or "X hours ago"
  m = t.match(/^(\d+)\s*h(?:(?:ou)?rs?)?\s*(?:ago)?$/);
  if (m) return Math.floor((now - parseInt(m[1]) * 3600 * 1000) / 1000);

  // "Xd" or "X days ago"
  m = t.match(/^(\d+)\s*d(?:ays?)?\s*(?:ago)?$/);
  if (m) return Math.floor((now - parseInt(m[1]) * 86400 * 1000) / 1000);

  // "Yesterday at HH:MM"
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

  // Try parsing as a full date string
  const parsed = new Date(text.trim());
  if (!isNaN(parsed.getTime())) return Math.floor(parsed.getTime() / 1000);

  return null;
}

// ── Session management ───────────────────────────────────────────────────────

const SESSION_REDIS_KEY = "gigalertpro:facebook:session";
const SESSION_TTL = 7 * 86400; // 7 days

async function loadSession() {
  try {
    const raw = await redisGet(SESSION_REDIS_KEY);
    if (!raw) return null;
    const cookies = JSON.parse(raw);
    if (Array.isArray(cookies) && cookies.length > 0) {
      console.log(`Loaded ${cookies.length} cookies from Redis session`);
      return cookies;
    }
  } catch (err) {
    console.warn("Failed to load session from Redis:", err.message);
  }
  return null;
}

async function saveSession(cookies) {
  try {
    await redisSet(SESSION_REDIS_KEY, JSON.stringify(cookies), SESSION_TTL);
    console.log(
      `Saved ${cookies.length} cookies to Redis (TTL ${SESSION_TTL}s)`,
    );
  } catch (err) {
    console.warn("Failed to save session to Redis:", err.message);
  }
}

// ── Browser login ────────────────────────────────────────────────────────────

async function loginToFacebook(page) {
  if (!FB_EMAIL || !FB_PASSWORD) {
    throw new Error("FB_EMAIL and FB_PASSWORD env vars are required for login");
  }

  console.log("Performing fresh Facebook login...");
  await page.goto("https://www.facebook.com/login/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await sleep(3000);

  // Accept cookies dialog if present
  try {
    const cookieBtn = page
      .locator(
        'button[data-cookiebanner="accept_button"], button:has-text("Allow all cookies"), button:has-text("Accept All"), button:has-text("Allow essential and optional cookies"), button:has-text("Accept"), [data-testid="cookie-policy-manage-dialog-accept-button"]',
      )
      .first();
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.click();
      await sleep(1500);
    }
  } catch {
    /* no cookie banner */
  }

  // Fill login form — try multiple selector strategies
  const emailInput = page.locator('input[name="email"], #email, input#email, input[type="text"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(FB_EMAIL);
  await randomDelay(500, 1000);

  const passInput = page.locator('input[name="pass"], #pass, input#pass, input[type="password"]').first();
  await passInput.waitFor({ state: "visible", timeout: 10000 });
  await passInput.fill(FB_PASSWORD);
  await randomDelay(300, 700);

  // Click login — try multiple selectors, fall back to Enter key
  const loginBtn = page.locator(
    'button[name="login"], button[data-testid="royal_login_button"], button[type="submit"], #loginbutton, input[type="submit"], button:has-text("Log In"), button:has-text("Log in")',
  ).first();
  try {
    await loginBtn.click({ timeout: 5000 });
  } catch {
    console.log("Login button not found by selector, pressing Enter instead...");
    await passInput.press("Enter");
  }

  // Wait for navigation after login
  await page
    .waitForURL((url) => !url.href.includes("/login"), { timeout: 30000 })
    .catch(() => {});
  await sleep(3000);

  // Check for checkpoint / 2FA
  const url = page.url();
  if (
    url.includes("checkpoint") ||
    url.includes("two_step_verification") ||
    url.includes("login/identify")
  ) {
    throw new Error(
      "Facebook login hit a checkpoint/2FA. Please resolve manually, then re-run to save the new session.",
    );
  }

  // Verify login succeeded
  const isLoggedIn = await page.evaluate(() => {
    return (
      !!document.querySelector('[aria-label="Facebook"]') ||
      !!document.querySelector('[role="navigation"]') ||
      !!document.querySelector('[aria-label="Your profile"]') ||
      !!document.querySelector('[data-pagelet="LeftRail"]') ||
      !!document.querySelector('[aria-label="Create a post"]') ||
      !!document.querySelector('[aria-label="Search Facebook"]') ||
      !!document.querySelector('[data-pagelet="RightRail"]')
    );
  });

  if (!isLoggedIn) {
    const currentUrl = page.url();
    console.log("  [debug] Login check failed. URL:", currentUrl);
    await page.screenshot({ path: "fb-login-debug.png", fullPage: false });
    if (currentUrl.includes("login") || currentUrl.includes("checkpoint")) {
      throw new Error(
        "Facebook login failed — still on login/checkpoint page. Check credentials.",
      );
    }
    console.log("  [warn] Could not verify login via DOM, but URL looks OK — continuing...");
  }

  console.log("Login successful");
}

// ── Post extraction ──────────────────────────────────────────────────────────

async function extractPosts(page) {
  return page.evaluate(() => {
    const out = [];
    // Try multiple container selectors — Facebook changes these frequently
    let containers = document.querySelectorAll('div[role="article"]');
    if (containers.length === 0) {
      containers = document.querySelectorAll('div[data-pagelet^="FeedUnit_"]');
    }
    if (containers.length === 0) {
      // Fallback: grab direct children of the feed
      const feed = document.querySelector('div[role="feed"]');
      if (feed) {
        containers = feed.querySelectorAll(":scope > div");
      }
    }
    if (containers.length === 0) {
      // Last resort: grab any significant text blocks in main content
      const main = document.querySelector('div[role="main"]');
      if (main) {
        containers = main.querySelectorAll('div[data-ad-preview], div[class]:has(div[dir="auto"])');
      }
    }

    for (const article of Array.from(containers).slice(0, 25)) {
      try {
        // Post text — find the longest text block
        const textDivs = article.querySelectorAll('div[dir="auto"]');
        let text = "";
        for (const d of textDivs) {
          const t = (d.innerText || "").replace(/\s+/g, " ").trim();
          if (t.length > text.length) text = t;
        }
        if (!text || text.length < 15) continue;

        // Author — look for strong text inside header links
        let author = null;
        const authorEl =
          article.querySelector("h2 a strong") ||
          article.querySelector("h3 a strong") ||
          article.querySelector("h4 a strong") ||
          article.querySelector('a[role="link"] > strong') ||
          article.querySelector("strong");
        if (authorEl) author = authorEl.innerText.trim();

        // Timestamp — look for links with aria-label containing time info
        let timeText = null;
        const timeLinks = article.querySelectorAll('a[role="link"]');
        for (const link of timeLinks) {
          const label = link.getAttribute("aria-label") || "";
          const innerText = (link.innerText || "").trim();
          // Match patterns like "2h", "1d", "Just now", "Yesterday", dates
          if (
            /^\d+[mhd]$|^just now$|^yesterday|^\w+ \d+/i.test(innerText) ||
            /^\d+[mhd]$|^just now$|^yesterday/i.test(label)
          ) {
            timeText = innerText || label;
            break;
          }
        }
        // Fallback: look for abbr with data-utime
        if (!timeText) {
          const abbr = article.querySelector("abbr[data-utime]");
          if (abbr) {
            const utime = abbr.getAttribute("data-utime");
            if (utime) timeText = utime;
          }
        }
        // Fallback: search for tooltip-style time spans
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

        // Post URL — look for permalink-style links
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
        // Fallback: use the timestamp link's href
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
        /* skip broken article */
      }
    }

    return out;
  });
}

// ── Main crawler ─────────────────────────────────────────────────────────────

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

  try {
    // ── 1. Restore or create session ──
    const savedCookies = await loadSession();
    if (savedCookies) {
      await context.addCookies(savedCookies);
      await page.goto("https://www.facebook.com/", {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await sleep(2000);

      const stillLoggedIn =
        !page.url().includes("/login") &&
        (await page
          .evaluate(
            () =>
              !!document.querySelector('[aria-label="Facebook"]') ||
              !!document.querySelector('[role="navigation"]') ||
              !!document.querySelector('[aria-label="Your profile"]'),
          )
          .catch(() => false));

      if (!stillLoggedIn) {
        console.log("Saved session expired — performing fresh login");
        await loginToFacebook(page);
        const cookies = await context.cookies();
        await saveSession(cookies);
      } else {
        console.log("Session restored from Redis — already logged in");
      }
    } else {
      await loginToFacebook(page);
      const cookies = await context.cookies();
      await saveSession(cookies);
    }

    // ── 2. Load seen set for dedup ──
    const SEEN_KEY = "gigalertpro:seen:facebook";
    const seenRaw = await redisSmembers(SEEN_KEY);
    const seenSet = new Set(seenRaw || []);
    console.log(`Seen set: ${seenSet.size} previously seen posts`);

    // ── 3. Search and collect posts ──
    const allPosts = [];
    const keywordStats = {};
    let totalExtracted = 0;

    for (let i = 0; i < SEARCH_KEYWORDS.length; i++) {
      const keyword = SEARCH_KEYWORDS[i];
      const encoded = encodeURIComponent(keyword);
      const searchUrl = `https://www.facebook.com/search/posts?q=${encoded}`;

      try {
        console.log(
          `[${i + 1}/${SEARCH_KEYWORDS.length}] Searching: "${keyword}"`,
        );
        await page.goto(searchUrl, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });

        // Wait for any content container to appear
        await page
          .waitForSelector('div[role="article"], div[role="feed"], div[role="main"], div[data-pagelet^="FeedUnit_"]', {
            timeout: 15000,
          })
          .catch(() => {});

        await sleep(3000);

        // Aggressive scrolling — scroll down and wait for new content to render
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

        // Scroll back to top so we can capture all loaded posts
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(500);

        // Debug: on first search, log page state and take screenshot
        if (i === 0) {
          console.log("  [debug] URL:", page.url());
          const debugInfo = await page.evaluate(() => {
            const articles = document.querySelectorAll('div[role="article"]');
            const feed = document.querySelectorAll('div[role="feed"]');
            const feedUnits = document.querySelectorAll('div[data-pagelet^="FeedUnit_"]');
            const main = document.querySelectorAll('div[role="main"]');
            const allDivs = document.querySelectorAll("div[role]");
            const roles = [...new Set(Array.from(allDivs).map(d => d.getAttribute("role")))];
            const feedChildren = feed.length > 0 ? feed[0].querySelectorAll(":scope > div").length : 0;
            return {
              articleCount: articles.length,
              feedCount: feed.length,
              feedChildren,
              feedUnitCount: feedUnits.length,
              mainCount: main.length,
              roles: roles.slice(0, 20),
              title: document.title,
              bodyText: document.body?.innerText?.slice(0, 500) || "empty",
            };
          });
          console.log("  [debug] Articles:", debugInfo.articleCount, "| Feed divs:", debugInfo.feedCount, "| Feed children:", debugInfo.feedChildren);
          console.log("  [debug] FeedUnit pagelets:", debugInfo.feedUnitCount, "| Main divs:", debugInfo.mainCount);
          console.log("  [debug] Roles on page:", debugInfo.roles.join(", "));
          console.log("  [debug] Page title:", debugInfo.title);
          console.log("  [debug] Body text preview:", debugInfo.bodyText.slice(0, 300));
          await page.screenshot({ path: "fb-search-debug.png", fullPage: false });
          console.log("  [debug] Screenshot saved to fb-search-debug.png");
        }

        const posts = await extractPosts(page);
        keywordStats[keyword] = posts.length;
        totalExtracted += posts.length;

        for (const p of posts) {
          allPosts.push({
            ...p,
            searchQuery: keyword,
          });
        }

        console.log(`  → ${posts.length} posts extracted`);
      } catch (err) {
        console.warn(`  ✗ Search failed for "${keyword}":`, err.message);
        keywordStats[keyword] = 0;
      }

      // Anti-ban delay between searches
      if (i < SEARCH_KEYWORDS.length - 1) {
        await randomDelay(3000, 8000);
      }
    }

    await browser.close();
    console.log(`\nTotal raw posts extracted: ${totalExtracted}`);

    // ── 4. Deduplicate by post URL ──
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

    // ── 5. Regex gig filter ──
    const gigPosts = uniquePosts.filter((p) => isGigPost(p.text));
    console.log(
      `Gig filter: kept ${gigPosts.length}/${uniquePosts.length} (rejected ${uniquePosts.length - gigPosts.length} non-gig)`,
    );

    // ── 6. Parse timestamps and apply freshness filter ──
    const now = Date.now();
    const freshPosts = [];
    let staleCount = 0;

    for (const p of gigPosts) {
      const createdUtc = parseFBTimestamp(p.timeText);
      if (!createdUtc) {
        // If we can't parse the timestamp, keep the post with current time
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

    // ── 7. Split new vs already-seen for AI classification ──
    const newPosts = [];
    const existingPosts = [];

    for (const p of freshPosts) {
      if (seenSet.has(p.id)) {
        existingPosts.push(p);
      } else {
        newPosts.push(p);
      }
    }
    console.log(
      `New: ${newPosts.length}, Previously seen: ${existingPosts.length}`,
    );

    // ── 8. AI classify new posts only ──
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

      console.log(
        `AI filter: kept ${classifiedNew.length}/${newPosts.length} new posts`,
      );

      // Mark new posts as seen
      if (newPosts.length > 0) {
        const ids = newPosts.map((p) => p.id);
        await redisSadd(SEEN_KEY, ...ids);
        await redisExpire(SEEN_KEY, 86400);
      }
    }

    // ── 9. Merge classified new + existing → normalize to pipeline schema ──
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
      link_flair_text: p.searchQuery || null,
      _sub: "facebook",
      source: `fb-search-${(p.searchQuery || "").replace(/\s+/g, "-").toLowerCase()}`,
      source_platform: "Facebook",
      _ai_is_gig: true,
    }));

    // Sort newest first
    finalPosts.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

    // ── 10. Store to Redis ──
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

    // ── 11. Terminal metrics ──
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║         FACEBOOK CRAWLER RESULTS             ║");
    console.log("╠══════════════════════════════════════════════╣");
    console.log(
      `║ Keywords searched     │ ${SEARCH_KEYWORDS.length.toString().padStart(6)}`,
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

    // Top keywords by result count
    const sorted = Object.entries(keywordStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (sorted.length > 0) {
      console.log("\nTop keywords:");
      for (const [kw, count] of sorted) {
        console.log(`  ${count.toString().padStart(3)} │ ${kw}`);
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
    } catch { /* ignore screenshot errors */ }
    await browser.close().catch(() => {});
    console.error("Facebook crawler failed:", err.message || err);
    process.exit(1);
  }
}

main();
