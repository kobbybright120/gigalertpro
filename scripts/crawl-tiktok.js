import { chromium } from "playwright";

// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — TikTok Gig Crawler (DuckDuckGo Search)
//
// Finds TikTok gig/hiring posts via DuckDuckGo search (site:tiktok.com).
// Bypasses TikTok's login wall since DDG caches post text in snippets.
//
// Stores results in Upstash Redis for the x-feed API to merge & serve.
// Runs via GitHub Actions cron (every 2 hours).
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_KEY = "gigalertpro:tiktok:latest";
const REDIS_TTL = 9000; // 2.5 hours

// ── Gig-post filter ──────────────────────────────────────────────────────────
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
  /\bfollow for (?:more|daily|weekly)/i,
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
  for (const rx of REJECT_PATTERNS) if (rx.test(text)) return false;
  for (const rx of HIRING_SIGNALS) if (rx.test(text)) return true;
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
    console.warn("No Upstash credentials; skipping write");
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
  if (!resp.ok) throw new Error(`Redis SET failed: ${resp.status}`);
  console.log("Redis SET OK");
}

function encodeId(str) {
  try {
    return Buffer.from(str).toString("base64url");
  } catch {
    return encodeURIComponent(str).slice(0, 64);
  }
}

// ── Date extraction from snippets ───────────────────────────────────────────
// Instagram snippets: "36 comments - username on March 9, 2026: ..."
// TikTok snippets: "TikTok video from User (@user): ..."
// Also handles: "January 5, 2026", "Mar 9, 2026", "2026-04-10"
function parseSnippetDate(snippet) {
  if (!snippet) return null;
  // Pattern: "on Month Day, Year"
  const onDateMatch = snippet.match(
    /on\s+((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4})/i,
  );
  if (onDateMatch) {
    const d = new Date(onDateMatch[1]);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // Pattern: ISO date "2026-04-10"
  const isoMatch = snippet.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const d = new Date(isoMatch[1]);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

// Maximum age for posts — anything older is stale
const MAX_AGE_DAYS = parseInt(process.env.TT_MAX_AGE_DAYS || "30", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

// ── DDG search queries ──────────────────────────────────────────────────────
const SEARCH_QUERIES = [
  'site:tiktok.com "hiring" "developer"',
  'site:tiktok.com "hiring" "designer"',
  'site:tiktok.com "hiring" "writer"',
  'site:tiktok.com "hiring" "video editor"',
  'site:tiktok.com "hiring" "freelancer"',
  'site:tiktok.com "hiring" "virtual assistant"',
  'site:tiktok.com "hiring" "social media"',
  'site:tiktok.com "hiring" "graphic designer"',
  'site:tiktok.com "hiring" "web developer"',
  'site:tiktok.com "hiring" "animator"',
  'site:tiktok.com "hiring" "illustrator"',
  'site:tiktok.com "hiring" "copywriter"',
  'site:tiktok.com "hiring" "marketer"',
  'site:tiktok.com "looking for" "freelancer"',
  'site:tiktok.com "looking for" "developer"',
  'site:tiktok.com "looking for" "designer"',
  'site:tiktok.com "we are hiring"',
  'site:tiktok.com "now hiring" freelance',
  'site:tiktok.com "need a" developer',
  'site:tiktok.com "need a" designer',
];

// ── Playwright DDG crawler ──────────────────────────────────────────────────

async function crawlDDG() {
  const browser = await chromium.launch({
    headless: process.env.PW_HEADLESS !== "false",
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();
  const collected = [];

  for (const query of SEARCH_QUERIES) {
    // Extract human-readable label from DDG query (strip site: prefix)
    const queryLabel = query.replace(/site:\S+\s*/i, "").replace(/"/g, "").trim();
    try {
      console.log("Searching:", query);
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(1500 + Math.random() * 1000);

      const results = await page.evaluate(() => {
        const out = [];
        const items = document.querySelectorAll(".result");
        for (const item of items) {
          const anchor = item.querySelector(".result__a");
          if (!anchor) continue;
          const rawHref = anchor.href || "";
          const title = (anchor.innerText || "").trim();
          const snippet = (
            item.querySelector(".result__snippet")?.innerText || ""
          ).trim();

          // Extract real URL from DDG redirect
          let realUrl = rawHref;
          try {
            const parsed = new URL(rawHref);
            const uddg = parsed.searchParams.get("uddg");
            if (uddg) realUrl = decodeURIComponent(uddg);
          } catch {}

          // Only keep actual TikTok video/post links
          if (!realUrl.includes("tiktok.com")) continue;

          out.push({ title, url: realUrl, snippet });
        }
        return out;
      });

      console.log(`  → ${results.length} TikTok results`);
      for (const r of results) r._queryLabel = queryLabel;
      collected.push(...results);

      // Polite delay
      await page.waitForTimeout(2000 + Math.random() * 2000);
    } catch (err) {
      console.warn("Search error:", query, err.message);
    }
  }

  await browser.close();
  return collected;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    console.log(
      `Running ${SEARCH_QUERIES.length} DDG searches for TikTok gigs...`,
    );
    const posts = await crawlDDG();
    console.log(`Total raw results: ${posts.length}`);

    // Gig filter
    const gigs = posts.filter((p) => {
      const text = (p.title || "") + " " + (p.snippet || "");
      return isGigPost(text);
    });
    console.log(`Gig filter: ${gigs.length}/${posts.length} kept`);

    // Deduplicate by URL
    const map = new Map();
    for (const p of gigs) {
      // Normalize TikTok URL (remove query params)
      let cleanUrl = p.url;
      try {
        cleanUrl = new URL(p.url).origin + new URL(p.url).pathname;
      } catch {}

      const id = "tt_" + encodeId(cleanUrl);
      if (!map.has(id)) {
        // Extract author from URL pattern /@username/
        const authorMatch = cleanUrl.match(/\/@([^/]+)/);
        // Extract date from snippet or use crawl time
        const snippetDate = parseSnippetDate(p.snippet);
        const posted_at = snippetDate || new Date().toISOString();
        map.set(id, {
          id,
          _sub: "tiktok",
          source: "tiktok-ddg",
          link_flair_text: p._queryLabel || "TikTok",
          title: p.title.slice(0, 120),
          body_preview: (p.snippet || p.title).slice(0, 400),
          author: authorMatch ? authorMatch[1] : null,
          posted_at,
          url: cleanUrl,
        });
      }
    }

    // Filter out posts with extracted dates older than 30 days
    const now = Date.now();
    const deduped = Array.from(map.values());
    const results = deduped.filter((p) => {
      const ts = new Date(p.posted_at).getTime();
      if (isNaN(ts)) return true; // keep if unparseable
      const age = now - ts;
      if (age > MAX_AGE_MS) {
        console.log(
          `  Dropping old post (${Math.round(age / 86400000)}d): ${p.title.slice(0, 60)}`,
        );
        return false;
      }
      return true;
    });
    console.log(
      `Age filter: ${results.length}/${deduped.length} kept (max ${MAX_AGE_DAYS}d)`,
    );

    const payload = JSON.stringify({
      posts: results,
      post_count: results.length,
      cached_at: new Date().toISOString(),
      feed: "tiktok-playwright",
    });

    console.log(
      `Payload: ${results.length} unique posts, ${(payload.length / 1024).toFixed(1)} KB`,
    );

    await redisSet(REDIS_KEY, payload, REDIS_TTL);
    console.log(
      `Wrote ${results.length} TikTok posts to Upstash (key: ${REDIS_KEY})`,
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
