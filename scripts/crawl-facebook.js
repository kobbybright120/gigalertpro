// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Facebook Public Profile Crawler (mbasic)
//
// Uses mbasic.facebook.com (Facebook's lightweight HTML version) to search
// for freelance gig posts on public profiles. mbasic renders server-side
// HTML, avoiding JS-rendering issues and data center IP blocks.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { classifyAndFilter } from "./gig-classifier.js";

const MAX_AGE_DAYS = parseInt(process.env.FB_MAX_AGE_DAYS || "7", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

const FB_EMAIL = process.env.FB_EMAIL || "";
const FB_PASSWORD = process.env.FB_PASSWORD || "";

// ── Search keywords — organic freelance gig requests ────────────────────────

const SEARCH_KEYWORDS = [
  "looking for a video editor",
  "looking for a graphic designer",
  "looking for a web developer",
  "looking for a freelancer",
  "looking for a copywriter",
  "looking for a social media manager",
  "looking for a virtual assistant",
  "looking for a photographer",
  "looking for a UI/UX designer",
  "looking for an app developer",
  "looking for a brand designer",
  "need a video editor",
  "need a graphic designer",
  "need a web developer",
  "need a designer",
  "need a developer",
  "need a wordpress developer",
  "need a logo designer",
  "need an animator",
  "need a react developer",
  "hiring video editor",
  "hiring graphic designer",
  "hiring web developer",
  "hiring content writer",
  "hiring virtual assistant",
  "hiring social media manager",
  "hiring illustrator",
  "hiring voiceover artist",
  "hiring bookkeeper",
  "hiring shopify developer",
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
    const d = new Date(now - 86400 * 1000);
    return Math.floor(d.getTime() / 1000);
  }

  // "hrs" format like "2 hrs"
  m = t.match(/^(\d+)\s*hrs?\s*$/);
  if (m) return Math.floor((now - parseInt(m[1]) * 3600 * 1000) / 1000);

  // "mins" format like "15 mins"
  m = t.match(/^(\d+)\s*mins?\s*$/);
  if (m) return Math.floor((now - parseInt(m[1]) * 60 * 1000) / 1000);

  const parsed = new Date(text.trim());
  if (!isNaN(parsed.getTime())) return Math.floor(parsed.getTime() / 1000);

  return null;
}

// ── Session management ──────────────────────────────────────────────────────

const SESSION_REDIS_KEY = "gigalertpro:facebook:session";
const SESSION_TTL = 7 * 86400;

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
    console.log(`Saved ${cookies.length} cookies to Redis (TTL ${SESSION_TTL}s)`);
  } catch (err) {
    console.warn("Failed to save session to Redis:", err.message);
  }
}

// ── mbasic.facebook.com login ───────────────────────────────────────────────

async function loginMbasic(page) {
  if (!FB_EMAIL || !FB_PASSWORD) {
    throw new Error("FB_EMAIL and FB_PASSWORD env vars are required");
  }

  console.log("Logging in via mbasic.facebook.com...");
  await page.goto("https://mbasic.facebook.com/", { waitUntil: "load", timeout: 30000 });
  await sleep(2000);

  // Accept cookie consent if present
  try {
    const cookieBtn = page.locator('button[name="accept_only_essential"], button[value="Accept All"], a:has-text("Accept"), button:has-text("Accept")').first();
    if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cookieBtn.click();
      await sleep(1500);
    }
  } catch { /* no cookie banner */ }

  // mbasic has simple HTML form inputs
  const emailInput = page.locator('input[name="email"]').first();
  const passInput = page.locator('input[name="pass"]').first();

  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(FB_EMAIL);
  await randomDelay(300, 600);

  await passInput.waitFor({ state: "visible", timeout: 10000 });
  await passInput.fill(FB_PASSWORD);
  await randomDelay(200, 500);

  // Submit — mbasic uses a standard form submit button
  const loginBtn = page.locator('input[name="login"], input[type="submit"], button[name="login"]').first();
  await loginBtn.click();
  await page.waitForLoadState("load", { timeout: 30000 });
  await sleep(2000);

  // Check for checkpoint
  const url = page.url();
  if (url.includes("checkpoint") || url.includes("login/identify")) {
    await page.screenshot({ path: "fb-checkpoint-debug.png", fullPage: false });
    throw new Error("Facebook checkpoint/2FA detected. Please resolve manually.");
  }

  // Verify login — mbasic shows different content when logged in
  const pageText = await page.evaluate(() => document.body.innerText || "");
  const stillOnLogin = url.includes("/login") && !pageText.includes("News Feed") && !pageText.includes("Search");

  if (stillOnLogin) {
    await page.screenshot({ path: "fb-login-debug.png", fullPage: false });
    console.log("  [debug] Login may have failed. URL:", url);
    console.log("  [debug] Page text preview:", pageText.slice(0, 200));
    throw new Error("Facebook login failed — still on login page.");
  }

  console.log("Login successful (mbasic)");
}

// ── Extract posts from mbasic search results ────────────────────────────────

async function extractMbasicPosts(page) {
  return page.evaluate(() => {
    const out = [];

    // mbasic search results are in simple div/article structures
    // Look for story containers
    const stories = document.querySelectorAll(
      'div[role="article"], article, div.bx, div.by, div[id^="u_"]'
    );

    // Fallback: grab any div that looks like a post (has text + links)
    let containers = Array.from(stories);
    if (containers.length === 0) {
      // mbasic wraps posts in divs with specific structure
      const allDivs = document.querySelectorAll("#structured_composer_async_container div, #BrowseResultsContainer div, div[data-ft]");
      containers = Array.from(allDivs).filter(
        (d) => d.innerText && d.innerText.length > 30 && d.querySelectorAll("a").length > 0,
      );
    }

    // Last resort: grab text blocks from the main content area
    if (containers.length === 0) {
      const mainContent = document.querySelector('#root, #content, main, body');
      if (mainContent) {
        const sections = mainContent.querySelectorAll("div");
        containers = Array.from(sections).filter(
          (d) => {
            const text = (d.innerText || "").trim();
            return text.length > 50 && text.length < 3000 && d.querySelectorAll("a").length > 0;
          },
        );
      }
    }

    // Deduplicate by removing nested containers
    const unique = [];
    for (const c of containers) {
      let isChild = false;
      for (const u of unique) {
        if (u.contains(c) || c.contains(u)) {
          isChild = true;
          if (c.contains(u)) {
            unique.splice(unique.indexOf(u), 1);
            unique.push(c);
          }
          break;
        }
      }
      if (!isChild) unique.push(c);
    }

    for (const el of unique.slice(0, 30)) {
      try {
        const text = (el.innerText || "").replace(/\s+/g, " ").trim();
        if (!text || text.length < 20) continue;

        // Author — usually the first link with a profile URL
        let author = null;
        const authorLink = el.querySelector('a[href*="/profile.php"], a[href*="facebook.com/"]');
        if (authorLink) {
          author = authorLink.innerText.trim();
          if (author.length > 50) author = null;
        }
        if (!author) {
          const strong = el.querySelector("strong, h3 a, h4 a");
          if (strong) author = strong.innerText.trim();
        }

        // Timestamp — mbasic uses abbr tags or plain text
        let timeText = null;
        const abbr = el.querySelector("abbr");
        if (abbr) {
          timeText = abbr.getAttribute("data-utime") || abbr.innerText.trim();
        }
        if (!timeText) {
          const spans = el.querySelectorAll("span, a");
          for (const s of spans) {
            const t = (s.innerText || "").trim();
            if (/^\d+\s*(hrs?|mins?|[mhd]|hours?|minutes?|days?)\s*(ago)?$/i.test(t)) {
              timeText = t;
              break;
            }
          }
        }

        // Post URL
        let postUrl = null;
        const links = el.querySelectorAll("a[href]");
        for (const link of links) {
          const href = link.getAttribute("href") || "";
          if (
            href.includes("/story.php") ||
            href.includes("/posts/") ||
            href.includes("/permalink/") ||
            href.includes("story_fbid")
          ) {
            postUrl = href.startsWith("http")
              ? href
              : "https://mbasic.facebook.com" + href;
            break;
          }
        }

        // Clean text — remove author name from beginning if present
        let cleanText = text;
        if (author && cleanText.startsWith(author)) {
          cleanText = cleanText.slice(author.length).trim();
        }

        out.push({
          text: cleanText.slice(0, 2000),
          author,
          timeText,
          postUrl: postUrl || window.location.href,
        });
      } catch {
        /* skip */
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
      "Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
    viewport: { width: 412, height: 915 },
    locale: "en-US",
  });

  const page = await context.newPage();

  try {
    // ── 1. Restore or create session ──
    const savedCookies = await loadSession();
    let needsLogin = true;

    if (savedCookies) {
      await context.addCookies(savedCookies);
      await page.goto("https://mbasic.facebook.com/", { waitUntil: "load", timeout: 30000 });
      await sleep(2000);

      const pageText = await page.evaluate(() => document.body.innerText || "");
      const url = page.url();
      const isLoggedIn = !url.includes("/login") &&
        (pageText.includes("News Feed") || pageText.includes("Search") || pageText.includes("What's on your mind"));

      if (isLoggedIn) {
        console.log("Session restored from Redis — already logged in");
        needsLogin = false;
      } else {
        console.log("Saved session expired — performing fresh login");
      }
    }

    if (needsLogin) {
      await loginMbasic(page);
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
      // mbasic search URL for public posts
      const searchUrl = `https://mbasic.facebook.com/search/posts/?q=${encoded}&source=filter&isTrending=0`;

      try {
        console.log(`[${i + 1}/${SEARCH_KEYWORDS.length}] Searching: "${keyword}"`);
        await page.goto(searchUrl, { waitUntil: "load", timeout: 20000 });
        await sleep(2000);

        // Debug: on first search, log page state
        if (i === 0) {
          console.log("  [debug] URL:", page.url());
          const debugText = await page.evaluate(() => (document.body.innerText || "").slice(0, 500));
          console.log("  [debug] Page text:", debugText.slice(0, 300));
          await page.screenshot({ path: "fb-search-debug.png", fullPage: false });
          console.log("  [debug] Screenshot saved");
        }

        // Check if we got redirected to login
        if (page.url().includes("/login")) {
          console.warn("  ✗ Redirected to login — session may have expired");
          break;
        }

        const posts = await extractMbasicPosts(page);
        keywordStats[keyword] = posts.length;
        totalExtracted += posts.length;

        for (const p of posts) {
          allPosts.push({ ...p, searchQuery: keyword });
        }

        console.log(`  → ${posts.length} posts extracted`);

        // Try to load "See more results" if available
        try {
          const seeMore = page.locator('a:has-text("See more results"), a:has-text("See More Results"), a[href*="see_more"]').first();
          if (await seeMore.isVisible({ timeout: 2000 }).catch(() => false)) {
            await seeMore.click();
            await page.waitForLoadState("load", { timeout: 15000 });
            await sleep(1500);
            const morePosts = await extractMbasicPosts(page);
            for (const p of morePosts) {
              allPosts.push({ ...p, searchQuery: keyword });
            }
            totalExtracted += morePosts.length;
            if (morePosts.length > 0) {
              console.log(`  → ${morePosts.length} more posts from page 2`);
            }
          }
        } catch { /* no more results link */ }

      } catch (err) {
        console.warn(`  ✗ Search failed for "${keyword}":`, err.message);
        keywordStats[keyword] = 0;
      }

      // Anti-ban delay
      if (i < SEARCH_KEYWORDS.length - 1) {
        await randomDelay(3000, 8000);
      }
    }

    await browser.close();
    console.log(`\nTotal raw posts extracted: ${totalExtracted}`);

    // ── 4. Deduplicate ──
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

    // ── 6. Parse timestamps and freshness filter ──
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

    // ── 7. Split new vs already-seen ──
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

    // ── 8. AI classify new posts ──
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

    // ── 9. Normalize to pipeline schema ──
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
    console.log(`║ Keywords searched     │ ${SEARCH_KEYWORDS.length.toString().padStart(6)}`);
    console.log(`║ Raw posts extracted   │ ${totalExtracted.toString().padStart(6)}`);
    console.log(`║ After dedup           │ ${uniquePosts.length.toString().padStart(6)}`);
    console.log(`║ After gig filter      │ ${gigPosts.length.toString().padStart(6)}`);
    console.log(`║ After freshness       │ ${freshPosts.length.toString().padStart(6)}`);
    console.log(`║ New (AI classified)   │ ${classifiedNew.length.toString().padStart(6)}`);
    console.log(`║ Previously seen       │ ${existingPosts.length.toString().padStart(6)}`);
    console.log(`║ Final stored          │ ${Math.min(finalPosts.length, 300).toString().padStart(6)}`);
    console.log("╚══════════════════════════════════════════════╝");

    const sorted = Object.entries(keywordStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (sorted.length > 0) {
      console.log("\nTop keywords:");
      for (const [kw, count] of sorted) {
        console.log(`  ${count.toString().padStart(3)} │ ${kw}`);
      }
    }

    if (finalPosts.length > 0) {
      console.log("\nSample posts:");
      for (const p of finalPosts.slice(0, 10)) {
        const age =
          p.created_utc > 0
            ? `${Math.round((Date.now() / 1000 - p.created_utc) / 3600)}h ago`
            : "unknown";
        console.log(`  [${age}] ${p.title.slice(0, 80)}... — ${p.author || "?"}`);
      }
    }
  } catch (err) {
    try {
      await page.screenshot({ path: "fb-error-screenshot.png", fullPage: false });
      console.log("Screenshot saved to fb-error-screenshot.png");
      console.log("Page URL at failure:", page.url());
      const title = await page.title().catch(() => "unknown");
      console.log("Page title at failure:", title);
    } catch { /* ignore */ }
    await browser.close().catch(() => {});
    console.error("Facebook crawler failed:", err.message || err);
    process.exit(1);
  }
}

main();
