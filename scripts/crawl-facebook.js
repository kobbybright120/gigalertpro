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

// ── Dynamic query generation — grouped roles × social-media signals ─────────
// Roles are grouped by category so we can combine 2-3 related roles into a
// single compound OR query (e.g. ("video editor" OR "animator") need a).
// This cuts total queries by ~3x while maintaining the same coverage.
// Signals are tuned for how real clients post on social media, not job boards.

const ROLE_GROUPS = [
  // ── Design & Creative ──
  ["graphic designer", "UI UX designer", "illustrator"],
  ["logo designer", "brand designer", "thumbnail designer"],
  // ── Video & Animation ──
  ["video editor", "motion graphics", "animator"],
  ["YouTube editor", "podcast editor"],
  // ── Web Development ──
  ["web developer", "frontend developer", "Webflow developer"],
  ["backend developer", "full stack developer"],
  ["React developer", "Python developer", "WordPress developer"],
  ["Shopify developer", "no-code developer"],
  // ── Mobile & Specialized Dev ──
  ["mobile app developer", "iOS developer", "Android developer"],
  ["flutter developer", "game developer"],
  ["software engineer", "AI developer", "blockchain developer"],
  ["DevOps engineer", "chatbot developer"],
  // ── Writing & Content ──
  ["copywriter", "content writer", "SEO writer"],
  ["technical writer", "ghostwriter", "scriptwriter"],
  ["editor proofreader", "blogger", "content creator"],
  // ── Marketing & Sales ──
  ["social media manager", "community manager"],
  ["SEO specialist", "digital marketer", "growth hacker"],
  ["email marketer", "PPC specialist"],
  ["Google Ads expert", "Facebook Ads freelancer"],
  // ── Business & Admin ──
  ["virtual assistant", "executive assistant", "data entry"],
  ["project manager", "customer support"],
  ["bookkeeper", "accountant freelance"],
  // ── Audio & Voice ──
  ["voiceover artist", "voice actor"],
  ["music producer", "audio engineer", "sound designer"],
  // ── Data & AI ──
  ["data analyst", "data scientist", "automation expert"],
  // ── Specialized Niches ──
  ["translator", "photographer", "transcriptionist"],
  ["3D artist", "CAD designer", "Blender artist"],
  ["tutor online"],
];

const SIGNALS = [
  "hiring",
  "needed",
  "looking for",
  "seeking",
  "need a",
  "who can",
  "anyone know",
  "recommend",
  "DM me",
  "help me",
  "looking for someone",
  "can anyone",
  "who does",
  "budget",
  "freelance",
  "urgent",
];

const QUERY_BUDGET = parseInt(process.env.FB_QUERY_BUDGET || "30", 10);
const ROTATION_KEY = "gigalertpro:facebook:rotation";

function buildSearchQueries(groupIndices) {
  const timeSlot = Math.floor(Date.now() / (2 * 60 * 60 * 1000));
  const queries = [];
  for (const gi of groupIndices) {
    const group = ROLE_GROUPS[gi];
    const offset = (timeSlot + gi) % SIGNALS.length;
    const sig1 = SIGNALS[offset];
    const sig2 = SIGNALS[(offset + 1) % SIGNALS.length];
    const roleQuery =
      group.length > 1
        ? `(${group.map((r) => `"${r}"`).join(" OR ")})`
        : `"${group[0]}"`;
    const display = group.join(" / ");
    queries.push({ display: `${display} + ${sig1}`, search: `${roleQuery} ${sig1}`, groupIndex: gi });
    queries.push({ display: `${display} + ${sig2}`, search: `${roleQuery} ${sig2}`, groupIndex: gi });
  }
  return queries.sort(() => Math.random() - 0.5);
}

async function getRotationOrder() {
  const raw = await redisCommand("GET", ROTATION_KEY);
  const lastSearched = raw ? JSON.parse(raw) : {};
  const indices = Array.from({ length: ROLE_GROUPS.length }, (_, i) => i);
  indices.sort((a, b) => (lastSearched[a] || 0) - (lastSearched[b] || 0));
  return { indices, lastSearched };
}

async function updateRotation(searchedIndices, lastSearched) {
  const now = Date.now();
  for (const i of searchedIndices) {
    lastSearched[i] = now;
  }
  await redisSet(ROTATION_KEY, JSON.stringify(lastSearched), 86400 * 7);
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

const BROWSER_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
];

const TEXT_BROWSER_USER_AGENTS = [
  "Lynx/2.9.2 libwww-FM/2.14",
  "Lynx/2.8.9rel.1 libwww-FM/2.14",
  "Links (2.29; Linux x86_64; GNU C 12.2)",
  "w3m/0.5.3+git20230718",
  "ELinks/0.13.2 (textmode; Linux x86_64)",
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getHttpHeaders(ua) {
  return {
    "User-Agent": ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

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

function cleanSearchText(text) {
  return text
    .replace(/^\d+\.\s*/, "")
    .replace(/\s*[-–—·|]\s*Facebook\b.*$/i, "")
    .replace(/\bFacebook\s*[-–—·|]\s*/gi, "")
    .replace(/\bfacebook\.com\b/gi, "")
    .replace(/\bPosted\s+\d+[smhdw]\s+ago\b/gi, "")
    .replace(/\bPosted\s+by\b.*/gi, "")
    .replace(/\bSign up\b.*$/gi, "")
    .replace(/\bLog in\b.*$/gi, "")
    .replace(/\bSee more\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
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

    // Extract visible text (strip HTML tags + search artifacts)
    const text = cleanSearchText(
      decodeHtmlEntities(
        chunk
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
      )
    );

    if (text.length < 20) continue;

    // Try to extract a date — check short relative formats first ("3h", "2d", "1w"),
    // then long relative ("3 hours ago"), then absolute ("June 5, 2024")
    let dateText = null;
    const relMatch = text.match(/\b(\d+)\s*(h|hr|hrs|d|day|days|w|wk|wks|min|m)\b/i);
    if (relMatch) {
      const num = relMatch[1];
      const unit = relMatch[2].toLowerCase();
      if (unit === "h" || unit === "hr" || unit === "hrs") dateText = `${num} hours ago`;
      else if (unit === "d" || unit === "day" || unit === "days") dateText = `${num} days ago`;
      else if (unit === "w" || unit === "wk" || unit === "wks") dateText = `${num} weeks ago`;
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
  const query = `site:facebook.com ${keyword}`;
  const encoded = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encoded}&filters=ex1%3a"ez1"&count=20`;

  try {
    const resp = await fetch(url, { headers: getHttpHeaders(randomFrom(BROWSER_USER_AGENTS)), redirect: "follow" });
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

async function searchDDGLite(keyword, dateFilter = "w") {
  const query = `site:facebook.com ${keyword}`;
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&df=${dateFilter}`;

  try {
    const resp = await fetch(url, {
      headers: getHttpHeaders(randomFrom(TEXT_BROWSER_USER_AGENTS)),
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

  m = t.match(/(\d+)\s*(?:month)s?\s*ago/);
  if (m) return Math.floor((now - parseInt(m[1]) * 30 * 86400 * 1000) / 1000);

  if (/\byesterday\b/.test(t)) return Math.floor((now - 86400 * 1000) / 1000);
  if (/\btoday\b/.test(t)) return Math.floor(now / 1000);
  if (/\blast\s+week\b/.test(t)) return Math.floor((now - 7 * 86400 * 1000) / 1000);

  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\b/);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3)];
    const day = parseInt(m[2]);
    const year = m[3] ? parseInt(m[3]) : new Date().getFullYear();
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  }

  m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) {
    const d = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
    if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  }

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

    // ── 2. Build search queries (grouped roles, rotated across runs) ──
    const { indices: rotationOrder, lastSearched } = await getRotationOrder();
    const groupsThisRun = rotationOrder.slice(0, Math.ceil(QUERY_BUDGET / 2));
    const searchQueries = buildSearchQueries(groupsThisRun);
    console.log(
      `Generated ${searchQueries.length} queries from ${groupsThisRun.length}/${ROLE_GROUPS.length} groups (budget: ${QUERY_BUDGET})`,
    );

    let ddgBlocked = false;
    let bingBlocked = false;
    let consecutiveEmpty = 0;

    for (let i = 0; i < searchQueries.length; i++) {
      const { display, search } = searchQueries[i];
      let results = [];
      let engine = "—";

      // Try DDG Lite — daily filter first (fresher), fall back to weekly if empty
      if (!ddgBlocked) {
        results = await searchDDGLite(search, "d");
        if (results.length === 0) {
          results = await searchDDGLite(search, "w");
        }
        if (results.length === 0) {
          // Check if it was a rate limit (DDG returning non-200)
          const testResp = await fetch(
            `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent("test")}`,
            { headers: getHttpHeaders(randomFrom(TEXT_BROWSER_USER_AGENTS)) },
          ).catch(() => null);
          if (testResp && !testResp.ok) {
            ddgBlocked = true;
            console.log("  DDG Lite rate-limited — switching to Bing");
          }
        } else {
          engine = "DDG";
        }
      }

      // Fall back to Bing if DDG returned nothing
      if (results.length === 0 && !bingBlocked) {
        results = await searchBing(search);
        if (results.length > 0) {
          engine = "Bing";
        } else if (i > 2) {
          // After a few tries, check if Bing is also blocking
          const testResp = await fetch(
            "https://www.bing.com/search?q=test",
            { headers: getHttpHeaders(randomFrom(BROWSER_USER_AGENTS)) },
          ).catch(() => null);
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

      console.log(`[${i + 1}/${searchQueries.length}] ${display} → ${results.length} [${engine}]`);

      // Track consecutive empties for adaptive delay
      if (results.length === 0) {
        consecutiveEmpty++;
      } else {
        consecutiveEmpty = 0;
      }

      // If both engines are blocked, stop early
      if (ddgBlocked && bingBlocked) {
        console.log("Both search engines blocked — stopping early");
        break;
      }

      // Adaptive delays: base 8-15s, +2s per consecutive empty result (max +10s extra)
      if (i < searchQueries.length - 1) {
        const extraDelay = Math.min(consecutiveEmpty * 2000, 10000);
        await randomDelay(8000 + extraDelay, 15000 + extraDelay);
      }
    }

    // Update rotation tracking so next run picks different groups
    const searchedGroupIndices = [...new Set(searchQueries.map((q) => q.groupIndex))];
    await updateRotation(searchedGroupIndices, lastSearched);

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

    // ── 4a. Secondary dedup by text fingerprint (catches same post under different URLs) ──
    const fingerprintSeen = new Set();
    const fingerprintDeduped = [];
    for (const p of uniquePosts) {
      const fp = (p.text || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      if (fp.length < 10 || !fingerprintSeen.has(fp)) {
        if (fp.length >= 10) fingerprintSeen.add(fp);
        fingerprintDeduped.push(p);
      }
    }
    const fpRejected = uniquePosts.length - fingerprintDeduped.length;
    if (fpRejected > 0) {
      console.log(`Content dedup: removed ${fpRejected} near-duplicate posts`);
    }

    // ── 5. URL validation — reject non-post links ──
    const validPosts = fingerprintDeduped.filter((p) => isValidPostUrl(p.url));
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
      created_utc: p.created_utc || 0,
      num_comments: 0,
      ups: 0,
      link_flair_text: null,
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
    console.log(`║ Groups searched       │ ${groupsThisRun.length.toString().padStart(3)}/${ROLE_GROUPS.length.toString().padEnd(2)}`);
    console.log(`║ Queries searched      │ ${searchQueries.length.toString().padStart(6)}`);
    console.log(`║ Raw results found     │ ${totalExtracted.toString().padStart(6)}`);
    console.log(`║ After URL dedup       │ ${uniquePosts.length.toString().padStart(6)}`);
    console.log(`║ After content dedup   │ ${fingerprintDeduped.length.toString().padStart(6)}`);
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
