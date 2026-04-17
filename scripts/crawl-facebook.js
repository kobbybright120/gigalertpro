// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Facebook Gig Crawler (via DuckDuckGo Search)
//
// Searches DuckDuckGo for public Facebook posts containing freelance gig
// keywords. Uses queries like: site:facebook.com "looking for a video editor"
// No Facebook login required — all posts are publicly indexed.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { classifyAndFilter } from "./gig-classifier.js";

const MAX_AGE_DAYS = parseInt(process.env.FB_MAX_AGE_DAYS || "7", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

// ── Search keywords — organic freelance gig requests from public profiles ───

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

// ── Extract DuckDuckGo search results ───────────────────────────────────────

async function extractSearchResults(page) {
  return page.evaluate(() => {
    const results = [];
    // DuckDuckGo result containers
    const items = document.querySelectorAll("article[data-testid='result'], li[data-layout='organic'], div.result, div.results_links, ol.react-results--main li");

    for (const item of items) {
      try {
        const linkEl = item.querySelector("a[href*='facebook.com']");
        if (!linkEl) continue;

        let href = linkEl.getAttribute("href") || "";
        // DDG sometimes wraps URLs in redirect
        if (href.includes("duckduckgo.com") && href.includes("uddg=")) {
          try {
            href = decodeURIComponent(href.split("uddg=")[1].split("&")[0]);
          } catch { /* use as-is */ }
        }
        if (!href.includes("facebook.com")) continue;

        // Get the title
        const titleEl = item.querySelector("h2, h3, a[data-testid='result-title-a']");
        const title = titleEl ? titleEl.innerText.trim() : "";

        // Get the snippet
        const snippetEl = item.querySelector(
          "span[data-testid='result-snippet'], div.result__snippet, div[data-result='snippet'], p"
        );
        let snippet = "";
        if (snippetEl) {
          snippet = snippetEl.innerText.trim();
        }
        if (!snippet && !title) continue;

        // Date from snippet (DDG often prefixes with date)
        let dateText = null;
        const dateMatch = (snippet || "").match(/^(\w+ \d+, \d{4})\s*[—–-]\s*/);
        if (dateMatch) {
          dateText = dateMatch[1];
          snippet = snippet.slice(dateMatch[0].length).trim();
        }

        results.push({
          url: href,
          title,
          snippet,
          dateText,
        });
      } catch {
        /* skip */
      }
    }

    return results;
  });
}

// ── Parse date strings from Google snippets ─────────────────────────────────

function parseGoogleDate(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const now = Date.now();

  // "X hours ago", "X days ago", "X minutes ago"
  let m = t.match(/(\d+)\s*(?:hour|hr)s?\s*ago/);
  if (m) return Math.floor((now - parseInt(m[1]) * 3600 * 1000) / 1000);

  m = t.match(/(\d+)\s*(?:day)s?\s*ago/);
  if (m) return Math.floor((now - parseInt(m[1]) * 86400 * 1000) / 1000);

  m = t.match(/(\d+)\s*(?:min(?:ute)?)s?\s*ago/);
  if (m) return Math.floor((now - parseInt(m[1]) * 60 * 1000) / 1000);

  // "Mon DD, YYYY" or "DD Mon YYYY" style dates
  const parsed = new Date(text.trim());
  if (!isNaN(parsed.getTime())) return Math.floor(parsed.getTime() / 1000);

  return null;
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
  const keywordStats = {};
  let totalExtracted = 0;

  try {
    // ── 1. Load seen set for dedup ──
    const SEEN_KEY = "gigalertpro:seen:facebook";
    const seenRaw = await redisSmembers(SEEN_KEY);
    const seenSet = new Set(seenRaw || []);
    console.log(`Seen set: ${seenSet.size} previously seen posts`);

    // ── 2. Search DuckDuckGo for each keyword ──
    for (let i = 0; i < SEARCH_KEYWORDS.length; i++) {
      const keyword = SEARCH_KEYWORDS[i];
      // DuckDuckGo search for public Facebook posts, recent results
      const query = `site:facebook.com "${keyword}"`;
      const encoded = encodeURIComponent(query);
      // df=w restricts to past week on DDG
      const searchUrl = `https://duckduckgo.com/?q=${encoded}&df=w&ia=web`;

      try {
        console.log(`[${i + 1}/${SEARCH_KEYWORDS.length}] Searching: "${keyword}"`);
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        await sleep(3000);

        // Check for block/error
        const pageText = await page.evaluate(() => document.body.innerText || "");
        if (pageText.includes("blocked") || pageText.includes("bot") || pageText.length < 50) {
          console.warn("  ✗ DuckDuckGo may be blocking — stopping searches");
          await page.screenshot({ path: "fb-captcha-debug.png", fullPage: false });
          break;
        }

        // Debug: on first search, log page state
        if (i === 0) {
          console.log("  [debug] URL:", page.url());
          const resultCount = await page.evaluate(() =>
            document.querySelectorAll("article[data-testid='result'], li[data-layout='organic'], div.result, ol.react-results--main li").length
          );
          console.log("  [debug] Result containers:", resultCount);
          console.log("  [debug] Page text preview:", pageText.slice(0, 300));
          await page.screenshot({ path: "fb-search-debug.png", fullPage: false });
          console.log("  [debug] Screenshot saved");
        }

        const results = await extractSearchResults(page);
        keywordStats[keyword] = results.length;
        totalExtracted += results.length;

        for (const r of results) {
          allPosts.push({
            text: r.snippet || r.title,
            title: r.title,
            snippet: r.snippet,
            author: null,
            timeText: r.dateText,
            postUrl: r.url,
            searchQuery: keyword,
          });
        }

        console.log(`  → ${results.length} results found`);
      } catch (err) {
        console.warn(`  ✗ Search failed for "${keyword}":`, err.message);
        keywordStats[keyword] = 0;
      }

      // Anti-ban delay — Google rate-limits aggressively
      if (i < SEARCH_KEYWORDS.length - 1) {
        await randomDelay(5000, 12000);
      }
    }

    await browser.close();
    console.log(`\nTotal raw results: ${totalExtracted}`);

    // ── 3. Deduplicate by URL ──
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
    const combinedText = (p) => [p.title, p.snippet, p.text].filter(Boolean).join(" ");
    const gigPosts = uniquePosts.filter((p) => isGigPost(combinedText(p)));
    console.log(
      `Gig filter: kept ${gigPosts.length}/${uniquePosts.length} (rejected ${uniquePosts.length - gigPosts.length} non-gig)`,
    );

    // ── 5. Parse timestamps and freshness filter ──
    const now = Date.now();
    const freshPosts = [];
    let staleCount = 0;

    for (const p of gigPosts) {
      const createdUtc = parseGoogleDate(p.timeText);
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
        title: (p.title || p.text || "").slice(0, 120),
        selftext: (p.snippet || p.text || "").slice(0, 2000),
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
      title: (p.title || p.text || "").slice(0, 120),
      selftext: (p.snippet || p.text || "").slice(0, 2000),
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

    // ── 9. Store to Redis ──
    const payload = JSON.stringify({
      posts: finalPosts.slice(0, 300),
      post_count: Math.min(finalPosts.length, 300),
      cached_at: new Date().toISOString(),
      feed: "facebook-ddg",
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
    console.log(`║ Keywords searched     │ ${SEARCH_KEYWORDS.length.toString().padStart(6)}`);
    console.log(`║ Raw results found     │ ${totalExtracted.toString().padStart(6)}`);
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
        console.log(`  [${age}] ${p.title.slice(0, 80)} — ${p.permalink.slice(0, 50)}`);
      }
    }
  } catch (err) {
    try {
      await page.screenshot({ path: "fb-error-screenshot.png", fullPage: false });
      console.log("Screenshot saved to fb-error-screenshot.png");
      console.log("Page URL at failure:", page.url());
    } catch { /* ignore */ }
    await browser.close().catch(() => {});
    console.error("Facebook crawler failed:", err.message || err);
    process.exit(1);
  }
}

main();
