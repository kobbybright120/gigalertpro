// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — LinkedIn Gig Crawler (via DuckDuckGo Lite + Bing)
//
// Searches DuckDuckGo Lite and Bing for public LinkedIn posts containing
// freelance gig keywords. Uses plain HTTP fetch (no browser needed for search).
// No LinkedIn login required — all posts are publicly indexed.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyAndFilter } from "./gig-classifier.js";

const MAX_AGE_DAYS = parseInt(process.env.LI_MAX_AGE_DAYS || "7", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

// ── Dynamic query generation — role × signal matrix ─────────────────────────

const ROLES = [
  // ── Design & Creative ──
  "graphic designer",
  "UI UX designer",
  "illustrator",
  "video editor",
  "motion graphics",
  "animator",
  "logo designer",
  "thumbnail designer",
  "brand designer",
  // ── Development & Tech ──
  "web developer",
  "frontend developer",
  "backend developer",
  "mobile app developer",
  "software engineer",
  "AI developer",
  "game developer",
  "blockchain developer",
  "Shopify developer",
  "React developer",
  "Python developer",
  "WordPress developer",
  "flutter developer",
  "iOS developer",
  "Android developer",
  "DevOps engineer",
  "full stack developer",
  "Webflow developer",
  "no-code developer",
  // ── Writing & Content ──
  "copywriter",
  "content writer",
  "technical writer",
  "ghostwriter",
  "editor proofreader",
  "SEO writer",
  "scriptwriter",
  "content creator",
  "blogger",
  // ── Marketing & Sales ──
  "social media manager",
  "SEO specialist",
  "digital marketer",
  "growth hacker",
  "email marketer",
  "PPC specialist",
  "Google Ads expert",
  "community manager",
  // ── Business & Admin ──
  "virtual assistant",
  "data entry",
  "project manager",
  "customer support",
  "executive assistant",
  "bookkeeper",
  "accountant freelance",
  // ── Video & Audio ──
  "podcast editor",
  "voiceover artist",
  "voice actor",
  "music producer",
  "audio engineer",
  "sound designer",
  "YouTube editor",
  // ── Data & AI ──
  "data analyst",
  "data scientist",
  "automation expert",
  "chatbot developer",
  // ── Specialized Niches ──
  "translator",
  "photographer",
  "3D artist",
  "transcriptionist",
  "CAD designer",
  "Blender artist",
  "tutor online",
];

const SIGNALS = [
  "hiring",
  "wanted",
  "needed",
  "looking for",
  "seeking",
  "freelance",
  "remote",
];

function buildSearchQueries() {
  const queries = [];
  for (const role of ROLES) {
    const shuffled = [...SIGNALS].sort(() => Math.random() - 0.5);
    for (const signal of shuffled.slice(0, 2)) {
      queries.push({
        display: `${role} + ${signal}`,
        search: `"${role}" ${signal}`,
      });
    }
  }
  return queries.sort(() => Math.random() - 0.5);
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

// ── Search via plain HTTP fetch (no browser) ────────────────────────────────

const HTTP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function decodeHtmlEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanSearchText(text) {
  return text
    .replace(/^\d+\.\s*/, "")
    .replace(/\s*[-–—·|]\s*LinkedIn\b.*$/i, "")
    .replace(/\bLinkedIn\s*[-–—·|]\s*/gi, "")
    .replace(/\blinkedin\.com\b/gi, "")
    .replace(/\bPosted\s+\d+[smhdw]\s+ago\b/gi, "")
    .replace(/\bPosted\s+by\b.*/gi, "")
    .replace(/\bSign up\b.*$/gi, "")
    .replace(/\bLog in\b.*$/gi, "")
    .replace(/\bSign in\b.*$/gi, "")
    .replace(/\bJoin now\b.*$/gi, "")
    .replace(/\bSee more\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSnippets(html) {
  const results = [];
  const chunks = html.split(/<(?:li|div|article|tr)[^>]*>/i);

  for (const chunk of chunks) {
    const liMatch = chunk.match(/href="([^"]*linkedin\.com[^"]*)"/i);
    if (!liMatch) continue;

    let url = liMatch[1];
    if (url.includes("uddg=")) {
      try {
        url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]);
      } catch {}
    }
    if (!url.includes("linkedin.com")) continue;

    const text = cleanSearchText(
      decodeHtmlEntities(
        chunk
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " "),
      ),
    );

    if (text.length < 20) continue;

    let dateText = null;
    const relMatch = text.match(
      /\b(\d+)\s*(h|hr|hrs|d|day|days|w|wk|wks|min|m)\b/i,
    );
    if (relMatch) {
      const num = relMatch[1];
      const unit = relMatch[2].toLowerCase();
      if (unit === "h" || unit === "hr" || unit === "hrs")
        dateText = `${num} hours ago`;
      else if (unit === "d" || unit === "day" || unit === "days")
        dateText = `${num} days ago`;
      else if (unit === "w" || unit === "wk" || unit === "wks")
        dateText = `${num} weeks ago`;
      else if (unit === "min" || unit === "m") dateText = `${num} minutes ago`;
    } else {
      const dateMatch = text.match(/(\w+ \d+, \d{4})/);
      if (dateMatch) dateText = dateMatch[1];
    }

    results.push({
      url,
      text: text.slice(0, 500),
      dateText,
    });
  }

  return results;
}

async function searchBing(keyword) {
  const query = `site:linkedin.com ${keyword}`;
  const encoded = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encoded}&filters=ex1%3a"ez1"&count=20`;

  try {
    const resp = await fetch(url, {
      headers: HTTP_HEADERS,
      redirect: "follow",
    });
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
  const query = `site:linkedin.com ${keyword}`;
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

  m = t.match(/(\d+)\s*(?:week|wk)s?\s*ago/);
  if (m) return Math.floor((now - parseInt(m[1]) * 7 * 86400 * 1000) / 1000);

  m = t.match(/(\d+)\s*(?:min(?:ute)?)s?\s*ago/);
  if (m) return Math.floor((now - parseInt(m[1]) * 60 * 1000) / 1000);

  const parsed = new Date(text.trim());
  if (!isNaN(parsed.getTime())) return Math.floor(parsed.getTime() / 1000);

  return null;
}

// ── URL validation — reject non-post LinkedIn links ────────────────────────

const REJECT_URL_PATTERNS = [
  /linkedin\.com\/?$/,
  /linkedin\.com\/login/,
  /linkedin\.com\/help/,
  /linkedin\.com\/legal/,
  /linkedin\.com\/in\/[^/]+\/?$/,
  /linkedin\.com\/company\/[^/]+\/?$/,
  /linkedin\.com\/jobs\//,
  /linkedin\.com\/school\//,
  /linkedin\.com\/learning\//,
  /linkedin\.com\/premium/,
  /linkedin\.com\/signup/,
];

const POST_URL_SIGNALS = [
  /\/posts\//,
  /\/feed\/update\//,
  /\/pulse\//,
  /\/activity\//,
  /ugcPost/,
];

function isValidPostUrl(url) {
  if (!url || !url.includes("linkedin.com")) return false;
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
    const SEEN_KEY = "gigalertpro:seen:linkedin";
    const seenRaw = await redisSmembers(SEEN_KEY);
    const seenSet = new Set(seenRaw || []);
    console.log(`Seen set: ${seenSet.size} previously seen posts`);

    // ── 2. Build search queries (role × signal matrix, randomized each run) ──
    const searchQueries = buildSearchQueries();
    console.log(
      `Generated ${searchQueries.length} search queries (${ROLES.length} roles × 2 signals)`,
    );

    let ddgBlocked = false;
    let bingBlocked = false;

    for (let i = 0; i < searchQueries.length; i++) {
      const { display, search } = searchQueries[i];
      let results = [];

      if (!ddgBlocked) {
        results = await searchDDGLite(search);
        if (results.length === 0) {
          const testResp = await fetch(
            `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent("test")}`,
            {
              headers: {
                ...HTTP_HEADERS,
                "User-Agent": "Lynx/2.9.2 libwww-FM/2.14",
              },
            },
          ).catch(() => null);
          if (testResp && !testResp.ok) {
            ddgBlocked = true;
            console.log("  DDG Lite rate-limited — switching to Bing");
          }
        }
      }

      if (results.length === 0 && !bingBlocked) {
        results = await searchBing(search);
        if (results.length === 0 && i > 2) {
          const testResp = await fetch("https://www.bing.com/search?q=test", {
            headers: HTTP_HEADERS,
          }).catch(() => null);
          if (testResp && !testResp.ok) {
            bingBlocked = true;
            console.log("  Bing also rate-limited");
          }
        }
      }

      keywordStats[display] = results.length;
      totalExtracted += results.length;

      for (const r of results) {
        allPosts.push({ ...r, searchQuery: display });
      }

      const engine = results.length > 0 ? (ddgBlocked ? "Bing" : "DDG") : "—";
      console.log(
        `[${i + 1}/${searchQueries.length}] ${display} → ${results.length} [${engine}]`,
      );

      if (ddgBlocked && bingBlocked) {
        console.log("Both search engines blocked — stopping early");
        break;
      }

      // Delays to avoid rate limiting (4-7s)
      if (i < searchQueries.length - 1) {
        await randomDelay(4000, 7000);
      }
    }

    console.log(`\nTotal raw results: ${totalExtracted}`);

    // ── 4. Deduplicate by URL ──
    const deduped = new Map();
    for (const p of allPosts) {
      const key = p.url || p.text.slice(0, 100);
      const id = "li_" + encodeId(key);
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
        p.created_utc = 0;
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
    console.log(
      `New: ${newPosts.length}, Previously seen: ${existingPosts.length}`,
    );

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

      console.log(
        `AI filter: kept ${classifiedNew.length}/${newPosts.length} new posts`,
      );

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
      created_utc: p.created_utc || 0,
      num_comments: 0,
      ups: 0,
      link_flair_text: null,
      _sub: "linkedin",
      source: `li-search-${(p.searchQuery || "").replace(/\s+/g, "-").toLowerCase()}`,
      source_platform: "LinkedIn",
      _ai_is_gig: true,
    }));

    finalPosts.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

    // ── 10. Store to Redis ──
    const payload = JSON.stringify({
      posts: finalPosts.slice(0, 300),
      post_count: Math.min(finalPosts.length, 300),
      cached_at: new Date().toISOString(),
      feed: "linkedin-ddg",
      sources: { linkedin: finalPosts.length },
    });

    await redisSet("gigalertpro:linkedin:latest", payload, 7200);
    console.log(
      `\nStored ${Math.min(finalPosts.length, 300)} posts to Redis (key: gigalertpro:linkedin:latest, TTL 2h)`,
    );

    // ── 11. Terminal metrics ──
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║         LINKEDIN CRAWLER RESULTS             ║");
    console.log("╠══════════════════════════════════════════════╣");
    console.log(
      `║ Queries searched      │ ${searchQueries.length.toString().padStart(6)}`,
    );
    console.log(
      `║ Raw results found     │ ${totalExtracted.toString().padStart(6)}`,
    );
    console.log(
      `║ After dedup           │ ${uniquePosts.length.toString().padStart(6)}`,
    );
    console.log(
      `║ Valid post URLs       │ ${validPosts.length.toString().padStart(6)}`,
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
        console.log(
          `  [${age}] ${p.title.slice(0, 80)} — ${p.permalink.slice(0, 50)}`,
        );
      }
    }
  } catch (err) {
    console.error("LinkedIn crawler failed:", err.message || err);
    process.exit(1);
  }
}

main();
