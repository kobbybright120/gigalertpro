// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Facebook Gig Crawler (via DuckDuckGo Lite + Bing)
//
// Searches DuckDuckGo Lite and Bing for public Facebook posts containing
// freelance gig keywords. Uses plain HTTP fetch (no browser needed for search).
// No Facebook login required — all posts are publicly indexed.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyAndFilter } from "./gig-classifier.js";

const MAX_AGE_DAYS = parseInt(process.env.FB_MAX_AGE_DAYS || "7", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

// ── Search keywords — organized by skill category (mirrors X/Nitter strategy) ─

const SEARCH_KEYWORDS = [
  // ── Design & Creative ──
  "hiring graphic designer",
  "hiring UI UX designer",
  "hiring illustrator",
  "hiring video editor",
  "hiring motion graphics",
  "hiring animator",
  "need a logo designer",
  "looking for graphic designer",
  "need a designer freelance",
  "hiring thumbnail designer",
  "hiring brand designer",
  // ── Development & Tech ──
  "hiring web developer",
  "hiring frontend developer",
  "hiring backend developer",
  "hiring mobile app developer",
  "hiring software engineer",
  "hiring AI developer",
  "hiring game developer",
  "hiring blockchain developer",
  "hiring Shopify developer",
  "need a developer",
  "looking for programmer",
  "hiring React developer",
  "hiring Python developer",
  "hiring WordPress developer",
  "hiring flutter developer",
  "hiring iOS developer",
  "hiring Android developer",
  "hiring DevOps engineer",
  "need a full stack developer",
  "hiring Webflow developer",
  "hiring no-code developer",
  // ── Writing & Content ──
  "hiring copywriter",
  "hiring content writer",
  "hiring technical writer",
  "hiring ghostwriter",
  "hiring editor proofreader",
  "need a writer",
  "looking for blogger",
  "hiring SEO writer",
  "hiring scriptwriter",
  "need a content creator",
  // ── Marketing & Sales ──
  "hiring social media manager",
  "hiring SEO specialist",
  "hiring digital marketer",
  "hiring growth hacker",
  "hiring email marketer",
  "need a marketer",
  "hiring PPC specialist",
  "hiring Google Ads expert",
  "hiring Facebook Ads freelancer",
  "hiring community manager",
  "hiring lead generation",
  // ── Business & Admin ──
  "hiring virtual assistant",
  "hiring data entry",
  "hiring project manager",
  "hiring customer support",
  "hiring executive assistant",
  "need a VA",
  "hiring bookkeeper",
  "hiring accountant freelance",
  "hiring admin assistant remote",
  // ── Video & Audio ──
  "hiring podcast editor",
  "hiring voiceover artist",
  "hiring voice actor",
  "hiring music producer",
  "hiring audio engineer",
  "hiring sound designer",
  "hiring YouTube editor",
  // ── Data & AI ──
  "hiring data analyst freelance",
  "hiring data scientist",
  "need a data scraper",
  "hiring automation expert",
  "hiring chatbot developer",
  // ── Specialized Niches ──
  "hiring translator",
  "hiring photographer",
  "hiring 3D artist",
  "hiring transcriptionist",
  "hiring CAD designer",
  "hiring Blender artist",
  "hiring tutor online",
  // ── General / Remote ──
  "freelance gig",
  "freelance opportunity",
  "remote freelance job",
  "looking for freelancer",
  "need a freelancer",
  "hiring freelancer",
];

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

// ── Search via plain HTTP fetch (no browser) ────────────────────────────────

const HTTP_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function decodeHtmlEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractSnippets(html) {
  const results = [];
  // Generic pattern: find text blocks near Facebook links
  // Split HTML by result-like boundaries
  const chunks = html.split(/<(?:li|div|article|tr)[^>]*>/i);

  for (const chunk of chunks) {
    // Check if chunk contains a Facebook URL
    const fbMatch = chunk.match(/href="([^"]*facebook\.com[^"]*)"/i);
    if (!fbMatch) continue;

    let url = fbMatch[1];
    if (url.includes("uddg=")) {
      try { url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]); } catch {}
    }
    if (!url.includes("facebook.com")) continue;

    // Extract visible text (strip HTML tags)
    const text = decodeHtmlEntities(
      chunk
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
    )
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 20) continue;

    // Try to extract a date
    let dateText = null;
    const dateMatch = text.match(/(\w+ \d+, \d{4})/);
    if (dateMatch) dateText = dateMatch[1];

    results.push({
      url,
      text: text.slice(0, 500),
      dateText,
    });
  }

  return results;
}

async function searchBing(keyword) {
  const query = `site:facebook.com "${keyword}"`;
  const encoded = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encoded}&filters=ex1%3a"ez1"&count=20`;

  try {
    const resp = await fetch(url, { headers: HTTP_HEADERS, redirect: "follow" });
    if (!resp.ok) {
      console.log(`  [debug] Bing returned ${resp.status}`);
      return [];
    }
    const html = await resp.text();

    if (html.includes("captcha") || html.includes("unusual traffic")) {
      console.log("  [debug] Bing CAPTCHA detected");
      return [];
    }

    return extractSnippets(html);
  } catch (err) {
    console.warn(`  [debug] Bing fetch failed:`, err.message);
    return [];
  }
}

async function searchDDGLite(keyword) {
  const query = `site:facebook.com "${keyword}"`;
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&df=w`;

  try {
    const resp = await fetch(url, {
      headers: {
        ...HTTP_HEADERS,
        "User-Agent": "Lynx/2.9.2 libwww-FM/2.14",
      },
      redirect: "follow",
    });
    if (!resp.ok) {
      console.log(`  [debug] DDG Lite returned ${resp.status}`);
      return [];
    }
    const html = await resp.text();
    return extractSnippets(html);
  } catch (err) {
    console.warn(`  [debug] DDG Lite fetch failed:`, err.message);
    return [];
  }
}

// ── Parse date strings ──────────────────────────────────────────────────────

function parseSearchDate(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const now = Date.now();

  let m = t.match(/(\d+)\s*(?:hour|hr)s?\s*ago/);
  if (m) return Math.floor((now - parseInt(m[1]) * 3600 * 1000) / 1000);

  m = t.match(/(\d+)\s*(?:day)s?\s*ago/);
  if (m) return Math.floor((now - parseInt(m[1]) * 86400 * 1000) / 1000);

  m = t.match(/(\d+)\s*(?:min(?:ute)?)s?\s*ago/);
  if (m) return Math.floor((now - parseInt(m[1]) * 60 * 1000) / 1000);

  const parsed = new Date(text.trim());
  if (!isNaN(parsed.getTime())) return Math.floor(parsed.getTime() / 1000);

  return null;
}

// ── URL validation — reject non-post Facebook links ────────────────────────

const REJECT_URL_PATTERNS = [
  /facebook\.com\/?$/,
  /facebook\.com\/login/,
  /facebook\.com\/help/,
  /facebook\.com\/policies/,
  /facebook\.com\/business/,
  /facebook\.com\/marketplace/,
  /facebook\.com\/events\/\d+\/?$/,
  /facebook\.com\/groups\/[^/]+\/?$/,
  /facebook\.com\/[^/]+\/?$/,
  /facebook\.com\/watch\/?$/,
  /facebook\.com\/(?:photo|video)\.php/,
];

const POST_URL_SIGNALS = [
  /\/posts\//,
  /\/permalink\//,
  /story_fbid/,
  /\/groups\/[^/]+\/posts\//,
  /\/[^/]+\/(?:posts|videos|photos)\/\d+/,
];

function isValidPostUrl(url) {
  if (!url || !url.includes("facebook.com")) return false;
  for (const rx of REJECT_URL_PATTERNS) {
    if (rx.test(url)) return false;
  }
  return POST_URL_SIGNALS.some((rx) => rx.test(url));
}

// ── Main crawler ────────────────────────────────────────────────────────────

async function main() {
  const allPosts = [];
  const keywordStats = {};
  let totalExtracted = 0;

  try {
    // ── 1. Load seen set for dedup ──
    const SEEN_KEY = "gigalertpro:seen:facebook";
    const seenRaw = await redisSmembers(SEEN_KEY);
    const seenSet = new Set(seenRaw || []);
    console.log(`Seen set: ${seenSet.size} previously seen posts`);

    // ── 2. Search each keyword — try DDG Lite first, fall back to Bing ──
    let ddgBlocked = false;
    let bingBlocked = false;

    for (let i = 0; i < SEARCH_KEYWORDS.length; i++) {
      const keyword = SEARCH_KEYWORDS[i];
      let results = [];

      // Try DDG Lite first (unless already blocked)
      if (!ddgBlocked) {
        results = await searchDDGLite(keyword);
        if (results.length === 0) {
          // Check if it was a 403 (DDG rate limit)
          const testResp = await fetch(
            `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent("test")}`,
            { headers: { ...HTTP_HEADERS, "User-Agent": "Lynx/2.9.2 libwww-FM/2.14" } },
          ).catch(() => null);
          if (testResp && !testResp.ok) {
            ddgBlocked = true;
            console.log("  DDG Lite rate-limited — switching to Bing");
          }
        }
      }

      // Fall back to Bing if DDG returned nothing
      if (results.length === 0 && !bingBlocked) {
        results = await searchBing(keyword);
        if (results.length === 0 && i > 2) {
          // After a few tries, check if Bing is also blocking
          const testResp = await fetch(
            "https://www.bing.com/search?q=test",
            { headers: HTTP_HEADERS },
          ).catch(() => null);
          if (testResp && !testResp.ok) {
            bingBlocked = true;
            console.log("  Bing also rate-limited");
          }
        }
      }

      keywordStats[keyword] = results.length;
      totalExtracted += results.length;

      for (const r of results) {
        allPosts.push({ ...r, searchQuery: keyword });
      }

      const engine = results.length > 0 ? (ddgBlocked ? "Bing" : "DDG") : "—";
      console.log(`[${i + 1}/${SEARCH_KEYWORDS.length}] "${keyword}" → ${results.length} [${engine}]`);

      // If both engines are blocked, stop early
      if (ddgBlocked && bingBlocked) {
        console.log("Both search engines blocked — stopping early");
        break;
      }

      // Longer delays to avoid rate limiting (8-15s)
      if (i < SEARCH_KEYWORDS.length - 1) {
        await randomDelay(8000, 15000);
      }
    }

    console.log(`\nTotal raw results: ${totalExtracted}`);

    // ── 4. Deduplicate by URL ──
    const deduped = new Map();
    for (const p of allPosts) {
      const key = p.url || p.text.slice(0, 100);
      const id = "fb_" + encodeId(key);
      if (!deduped.has(id)) {
        deduped.set(id, { id, ...p });
      }
    }
    const uniquePosts = Array.from(deduped.values());
    console.log(`After dedup: ${uniquePosts.length} unique posts`);

    // ── 5. URL validation — reject non-post links ──
    const validPosts = uniquePosts.filter((p) => isValidPostUrl(p.url));
    const urlRejected = uniquePosts.length - validPosts.length;
    if (urlRejected > 0) {
      console.log(`URL filter: rejected ${urlRejected} non-post links`);
    }
    console.log(`Valid post URLs: ${validPosts.length}`);

    // ── 6. Parse timestamps and freshness filter ──
    const now = Date.now();
    const freshPosts = [];
    let staleCount = 0;

    for (const p of validPosts) {
      const createdUtc = parseSearchDate(p.dateText);
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
        title: (p.text || "").slice(0, 120),
        selftext: (p.text || "").slice(0, 2000),
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
      permalink: p.url || "",
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
      feed: "facebook-ddg",
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
    console.log(`║ Raw results found     │ ${totalExtracted.toString().padStart(6)}`);
    console.log(`║ After dedup           │ ${uniquePosts.length.toString().padStart(6)}`);
    console.log(`║ Valid post URLs       │ ${validPosts.length.toString().padStart(6)}`);
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
    console.error("Facebook crawler failed:", err.message || err);
    process.exit(1);
  }
}

main();
