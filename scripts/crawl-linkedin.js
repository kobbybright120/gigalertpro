// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — LinkedIn Gig Crawler (via DuckDuckGo Lite + Bing + Google)
//
// Searches DuckDuckGo Lite, Bing, and Google for public LinkedIn posts
// containing freelance gig keywords. Uses plain HTTP fetch (no browser).
// No LinkedIn login required — all posts are publicly indexed.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyAndFilter } from "./gig-classifier.js";
import { notifyUsersOfNewGigs } from "./lib/email-notifier.js";
import { preFilterPost, isValidLength } from "./lib/social-pre-filter.js";
import { readFile } from "node:fs/promises";

const MAX_AGE_DAYS = parseInt(process.env.LI_MAX_AGE_DAYS || "7", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

// ── Detail page fetching config ────────────────────────────────────────────
const DETAIL_LIMIT = parseInt(process.env.LI_DETAIL_LIMIT || "30", 10);
const DETAIL_CONCURRENCY = 5;
const DETAIL_BATCH_DELAY_MS = 500;
const DETAIL_TIMEOUT_MS = 10000;
const DETAIL_MAX_RETRIES = 1;

// ── Load seed queries from JSON ──────────────────────────────────────────────

const raw = await readFile(
  new URL("./linkedin-seeds.json", import.meta.url),
  "utf-8",
);
const SEEDS = JSON.parse(raw || "[]");
if (!Array.isArray(SEEDS) || SEEDS.length === 0) {
  console.error("No seeds configured. Edit scripts/linkedin-seeds.json.");
  process.exit(1);
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

async function redisGet(key) {
  try {
    return await redisCommand("GET", key);
  } catch {
    return null;
  }
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

// ── User-Agent rotation ────────────────────────────────────────────────────
const BROWSER_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];
const TEXT_BROWSER_USER_AGENTS = [
  "Lynx/2.9.2 libwww-FM/2.14",
  "Lynx/2.8.9rel.1 libwww-FM/2.14",
  "w3m/0.5.3+git20230718",
  "Links (2.29; Linux x86_64; GNU C; text)",
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getHttpHeaders(ua) {
  return {
    "User-Agent": ua || randomFrom(BROWSER_USER_AGENTS),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

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
  const seenUrls = new Set();
  const urlPattern = /href="([^"]*linkedin\.com[^"]*)"/gi;
  let match;

  while ((match = urlPattern.exec(html)) !== null) {
    let url = match[1];

    // Unwrap DDG redirect
    if (url.includes("uddg=")) {
      try {
        url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]);
      } catch {}
    }
    // Unwrap Google redirect
    if (url.includes("/url?")) {
      try {
        const qMatch = url.match(/[?&](?:q|url)=([^&]+)/);
        if (qMatch) url = decodeURIComponent(qMatch[1]);
      } catch {}
    }

    if (!url.includes("linkedin.com")) continue;

    const normalizedUrl = url.replace(/\/+$/, "");
    if (seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);

    // Extract text from a 1700-char context window around the URL match
    const start = Math.max(0, match.index - 200);
    const end = Math.min(html.length, match.index + 1500);
    const context = html.slice(start, end);

    const text = cleanSearchText(
      decodeHtmlEntities(
        context
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
      url: normalizedUrl,
      text: text.slice(0, 500),
      dateText,
      author: extractAuthorFromUrl(normalizedUrl),
    });
  }

  return results;
}

async function searchBing(keyword) {
  const query = `site:linkedin.com ${keyword}`;
  const encoded = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encoded}&freshness=Week&count=20`;

  try {
    const resp = await fetch(url, {
      headers: getHttpHeaders(),
      redirect: "follow",
    });
    if (!resp.ok) {
      console.log(`  [debug] Bing returned ${resp.status}`);
      return null;
    }
    const html = await resp.text();

    if (html.includes("captcha") || html.includes("unusual traffic")) {
      console.log("  [debug] Bing CAPTCHA detected");
      return null;
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
      headers: getHttpHeaders(randomFrom(TEXT_BROWSER_USER_AGENTS)),
      redirect: "follow",
    });
    if (!resp.ok) {
      console.log(`  [debug] DDG Lite returned ${resp.status}`);
      return null;
    }
    const html = await resp.text();
    return extractSnippets(html);
  } catch (err) {
    console.warn(`  [debug] DDG Lite fetch failed:`, err.message);
    return [];
  }
}

async function searchGoogle(keyword) {
  const query = `site:linkedin.com ${keyword}`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbs=qdr:w&num=20&hl=en`;

  try {
    const resp = await fetch(url, {
      headers: getHttpHeaders(randomFrom(BROWSER_USER_AGENTS)),
      redirect: "follow",
    });
    if (!resp.ok) {
      console.log(`  [debug] Google returned ${resp.status}`);
      return null;
    }
    const html = await resp.text();

    if (
      html.includes("/sorry/") ||
      html.includes("captcha") ||
      html.includes("unusual traffic")
    ) {
      console.log("  [debug] Google CAPTCHA detected");
      return null;
    }

    return extractSnippets(html);
  } catch (err) {
    console.warn(`  [debug] Google fetch failed:`, err.message);
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

// ── URL validation — reject known junk, accept everything else ────────────

const REJECT_URL_PATTERNS = [
  /linkedin\.com\/?$/,
  /linkedin\.com\/login/,
  /linkedin\.com\/help/,
  /linkedin\.com\/legal/,
  /linkedin\.com\/signup/,
  /linkedin\.com\/premium/,
  /linkedin\.com\/learning\//,
  /linkedin\.com\/school\//,
  /linkedin\.com\/jobs\/view\//,
  /linkedin\.com\/privacy/,
  /linkedin\.com\/settings/,
  /linkedin\.com\/groups\//,
  /linkedin\.com\/company\//,
  /linkedin\.com\/events\//,
  /linkedin\.com\/pulse\//,
  /linkedin\.com\/newsletters\//,
];

function isValidPostUrl(url) {
  if (!url || !url.includes("linkedin.com")) return false;
  for (const rx of REJECT_URL_PATTERNS) {
    if (rx.test(url)) return false;
  }
  return true;
}

function extractAuthorFromUrl(url) {
  if (!url) return null;
  // Match linkedin.com/in/{username}/... or linkedin.com/posts/{username}_...
  let m = url.match(/linkedin\.com\/in\/([A-Za-z0-9._-]+)/);
  if (m) return m[1];
  m = url.match(/linkedin\.com\/posts\/([A-Za-z0-9._-]+?)_/);
  if (m) return m[1];
  return null;
}

// ── Meta tag extraction helpers ────────────────────────────────────────────

function extractMeta(html, property) {
  const rx = new RegExp(
    `<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*?)["'][^>]*/?>` +
    `|<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']${property}["'][^>]*/?>`,
    "i",
  );
  const m = html.match(rx);
  if (!m) return null;
  const raw = m[1] || m[2] || "";
  return decodeHtmlEntities(raw.trim()) || null;
}

function extractMetaName(html, name) {
  const rx = new RegExp(
    `<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*?)["'][^>]*/?>` +
    `|<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']${name}["'][^>]*/?>`,
    "i",
  );
  const m = html.match(rx);
  if (!m) return null;
  const raw = m[1] || m[2] || "";
  return decodeHtmlEntities(raw.trim()) || null;
}

// ── Detail page fetching — enrich posts with OG tags + visible HTML ───────

const GENERIC_LI_DESCRIPTIONS = [
  /^See this post on LinkedIn/i,
  /^Join now to see/i,
  /^Sign in to view/i,
  /^LinkedIn$/i,
  /^\d+ comments on LinkedIn$/i,
];

async function fetchDetailPage(url) {
  for (let attempt = 0; attempt <= DETAIL_MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { ...getHttpHeaders(), "Accept-Encoding": "identity" },
        redirect: "follow",
        signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
      });

      if (resp.status === 429 || resp.status === 503) {
        if (attempt < DETAIL_MAX_RETRIES) {
          await sleep(Math.pow(2, attempt + 1) * 1000 + Math.random() * 500);
          continue;
        }
        return null;
      }
      if (resp.status === 999) return null; // LinkedIn bot detection

      if (!resp.ok) return null;

      const html = await resp.text();

      // Extract OG meta tags
      const ogTitle = extractMeta(html, "og:title");
      const ogDescription = extractMeta(html, "og:description");
      const ogImage = extractMeta(html, "og:image");

      const isGenericDesc = GENERIC_LI_DESCRIPTIONS.some((rx) =>
        rx.test((ogDescription || "").trim()),
      );

      // Extract timestamp — JSON-LD first
      let timestamp = null;
      const jsonLdMatch = html.match(
        /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
      );
      if (jsonLdMatch) {
        try {
          const ld = JSON.parse(jsonLdMatch[1]);
          const dateStr = ld.datePublished || ld.dateCreated;
          if (dateStr) {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) timestamp = Math.floor(d.getTime() / 1000);
          }
        } catch { /* invalid JSON-LD */ }
      }
      if (!timestamp) {
        const publishedTime = extractMeta(html, "article:published_time");
        if (publishedTime) {
          const d = new Date(publishedTime);
          if (!isNaN(d.getTime())) timestamp = Math.floor(d.getTime() / 1000);
        }
      }
      if (!timestamp) {
        const dtMatch = html.match(/datetime="(\d{4}-\d{2}-\d{2}T[^"]+)"/);
        if (dtMatch) {
          const d = new Date(dtMatch[1]);
          if (!isNaN(d.getTime())) timestamp = Math.floor(d.getTime() / 1000);
        }
      }

      // Extract author — from og:title "Author on LinkedIn: ..."
      let author = null;
      if (ogTitle) {
        const liAuthorMatch = ogTitle.match(/^(.+?)\s+on\s+LinkedIn[:\s]/i);
        if (liAuthorMatch) author = liAuthorMatch[1].trim();
      }
      if (!author) {
        const metaAuthor = extractMetaName(html, "author");
        if (metaAuthor) author = metaAuthor;
      }
      if (!author && jsonLdMatch) {
        try {
          const ld = JSON.parse(jsonLdMatch[1]);
          if (ld.author?.name) author = ld.author.name;
        } catch { /* ignore */ }
      }
      if (!author) author = extractAuthorFromUrl(url);

      // Extract body text from visible HTML
      let bodyText = null;
      const descDivMatch = html.match(
        /<div[^>]*class="[^"]*(?:description|attributed-text|feed-shared-text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      );
      if (descDivMatch) {
        bodyText = decodeHtmlEntities(
          descDivMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
        ).trim();
      }

      if (!ogDescription && !bodyText && !ogTitle) return null;

      return {
        ogTitle: ogTitle || null,
        ogDescription: isGenericDesc ? null : (ogDescription || null),
        ogImage: ogImage || null,
        author,
        timestamp,
        bodyText: bodyText || null,
      };
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError") return null;
      if (attempt < DETAIL_MAX_RETRIES) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function fetchDetailsBatch(posts) {
  const toFetch = posts.slice(0, DETAIL_LIMIT);
  if (toFetch.length === 0) return posts;

  console.log(`\n[detail] Fetching ${toFetch.length} detail pages (concurrency=${DETAIL_CONCURRENCY})...`);
  const start = Date.now();
  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < toFetch.length; i += DETAIL_CONCURRENCY) {
    const batch = toFetch.slice(i, i + DETAIL_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (post) => {
        if (!post.url) return { post, detail: null };
        const detail = await fetchDetailPage(post.url);
        return { post, detail };
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.detail) {
        const { post, detail } = r.value;
        if (detail.ogDescription && detail.ogDescription.length > (post.text || "").length) {
          post.text = detail.ogDescription;
        }
        if (detail.bodyText && detail.bodyText.length > (post.text || "").length) {
          post.text = detail.bodyText;
        }
        if (detail.timestamp && !post.created_utc) {
          post.dateText = null;
          post.created_utc = detail.timestamp;
        }
        if (detail.author && !post.author) {
          post.author = detail.author;
        }
        if (detail.ogImage) {
          post.ogImage = detail.ogImage;
        }
        enriched++;
      } else {
        failed++;
      }
    }

    if (i + DETAIL_CONCURRENCY < toFetch.length) {
      await sleep(DETAIL_BATCH_DELAY_MS);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[detail] Done in ${elapsed}s — ${enriched} enriched, ${failed} failed/skipped`);
  return posts;
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

    // ── 2. Build search queries from seed file ──
    const shuffled = [...SEEDS].sort(() => Math.random() - 0.5);
    const searchQueries = shuffled.map((q) => ({ display: q, search: q }));
    console.log(
      `Loaded ${searchQueries.length} seed queries from linkedin-seeds.json`,
    );

    // Engine order: cycle DDG → Google → Bing to spread load
    const engines = [
      { name: "DDG", fn: searchDDGLite },
      { name: "Google", fn: searchGoogle },
      { name: "Bing", fn: searchBing },
    ];
    const engineState = new Map(); // name -> { blockedAt, retried }

    for (let i = 0; i < searchQueries.length; i++) {
      const { display, search } = searchQueries[i];
      let results = null;
      let usedEngine = "—";

      // Try engines in round-robin order, starting from i % 3
      for (let attempt = 0; attempt < engines.length; attempt++) {
        const eng = engines[(i + attempt) % engines.length];
        const state = engineState.get(eng.name);

        if (state) {
          if (state.retried) continue; // already retried and failed — permanently blocked
          const elapsed = Date.now() - state.blockedAt;
          const cooldownMs = 60000 + Math.random() * 30000; // 60-90s
          if (elapsed < cooldownMs) continue; // still cooling down
          console.log(
            `  [cooldown] Retrying ${eng.name} after ${Math.round(elapsed / 1000)}s cooldown`,
          );
        }

        results = await eng.fn(search);
        if (results === null) {
          if (state) {
            state.retried = true;
            console.log(
              `  ${eng.name} blocked again after retry — permanently blocked`,
            );
          } else {
            engineState.set(eng.name, {
              blockedAt: Date.now(),
              retried: false,
            });
            console.log(
              `  ${eng.name} blocked — cooling down (60-90s before retry)`,
            );
          }
          continue;
        }

        // Success — clear cooldown state if engine recovered
        if (state) {
          engineState.delete(eng.name);
          console.log(`  ${eng.name} recovered after cooldown`);
        }
        usedEngine = eng.name;
        break;
      }

      // If all engines blocked or no results
      if (results === null) results = [];

      keywordStats[display] = results.length;
      totalExtracted += results.length;

      for (const r of results) {
        allPosts.push({ ...r, searchQuery: display });
      }

      console.log(
        `[${i + 1}/${searchQueries.length}] ${display} → ${results.length} [${usedEngine}]`,
      );

      // If all engines are permanently blocked, stop early
      const permanentlyBlocked = engines.filter(
        (e) => engineState.get(e.name)?.retried === true,
      ).length;
      if (permanentlyBlocked >= engines.length) {
        console.log("All search engines permanently blocked — stopping early");
        break;
      }

      // Delays to avoid rate limiting (12-20s for Google safety)
      if (i < searchQueries.length - 1) {
        await randomDelay(12000, 20000);
      }
    }

    console.log(`\nTotal raw results: ${totalExtracted}`);

    // ── Fallback: if 0 posts scraped, preserve existing Redis data ──
    const REDIS_KEY = "gigalertpro:linkedin:latest";
    const REDIS_TTL = 7200;

    if (allPosts.length === 0) {
      console.warn("[li-crawler] 0 posts fetched — all engines likely blocked");
      try {
        const existingRaw = await redisGet(REDIS_KEY);
        if (existingRaw) {
          await redisSet(REDIS_KEY, existingRaw, REDIS_TTL);
          console.warn(
            "[li-crawler] Refreshed TTL on existing Redis data (2h)",
          );
        } else {
          console.warn("[li-crawler] No existing Redis data to refresh");
        }
      } catch {
        /* best effort */
      }
      return;
    }

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

    // ── 5.5. Fetch detail pages for richer content ──
    if (validPosts.length > 0) {
      await fetchDetailsBatch(validPosts);
    }

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

    // ── 8. Pre-filter + AI classify new posts ──
    let classifiedNew = newPosts;
    if (newPosts.length > 0) {
      // Pre-filter: length + regex before AI
      const autoKept = [];
      const autoRejected = [];
      const toClassify = [];

      for (const p of newPosts) {
        const text = p.text || "";
        if (!isValidLength(text)) {
          autoRejected.push(p);
          continue;
        }
        const verdict = preFilterPost(text);
        if (verdict === "keep") autoKept.push(p);
        else if (verdict === "reject") autoRejected.push(p);
        else toClassify.push(p);
      }

      console.log(
        `Pre-filter: ${autoKept.length} auto-kept, ${autoRejected.length} auto-rejected, ${toClassify.length} to AI`,
      );

      // AI classify only ambiguous posts (with social prompt)
      let aiKept = [];
      if (toClassify.length > 0) {
        const forClassifier = toClassify.map((p) => ({
          id: p.id,
          name: p.id,
          title: (p.text || "").slice(0, 120),
          selftext: (p.text || "").slice(0, 2000),
          author: p.author || "unknown",
        }));

        const classified = await classifyAndFilter(forClassifier, "social");
        const classifiedIds = new Set(classified.map((c) => c.id));
        aiKept = toClassify.filter((p) => classifiedIds.has(p.id));
      }

      classifiedNew = [...autoKept, ...aiKept];
      console.log(
        `AI filter: kept ${aiKept.length}/${toClassify.length} posts sent to AI`,
      );
      console.log(
        `Total kept: ${classifiedNew.length}/${newPosts.length} new posts`,
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

    // ── 10. Merge with existing Redis data, then store ──
    let existingGigs = [];
    try {
      const existingRaw = await redisGet(REDIS_KEY);
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw);
        existingGigs = parsed.posts || [];
      }
    } catch {
      /* start fresh if read fails */
    }

    // Merge: this run's posts take priority, then existing, dedup by ID
    const mergedMap = new Map();
    for (const g of [...finalPosts, ...existingGigs]) {
      if (!mergedMap.has(g.id)) mergedMap.set(g.id, g);
    }
    const mergedPosts = [...mergedMap.values()]
      .sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0))
      .slice(0, 300);

    if (mergedPosts.length === 0) {
      console.warn(
        "[li-crawler] 0 posts after merge — skipping Redis write to preserve last-good data",
      );
    } else {
      const payload = JSON.stringify({
        posts: mergedPosts,
        post_count: mergedPosts.length,
        cached_at: new Date().toISOString(),
        feed: "linkedin-ddg",
        sources: { linkedin: finalPosts.length, existing: existingGigs.length },
      });

      await redisSet(REDIS_KEY, payload, REDIS_TTL);
      console.log(
        `\nStored ${mergedPosts.length} posts to Redis (${finalPosts.length} from this run + ${existingGigs.length} existing, key: ${REDIS_KEY}, TTL 2h)`,
      );
    }

    // ── Email notifications for premium users ──
    try {
      if (classifiedNew.length > 0) {
        const { url: redisUrl, token: redisToken } = getUpstashCredentials();
        await notifyUsersOfNewGigs(classifiedNew, "LinkedIn", {
          redisUrl,
          redisToken,
        });
      }
    } catch (err) {
      console.warn(
        "[li-crawler] Email notification error (non-fatal):",
        err.message,
      );
    }

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
      `║ Carried from Redis    │ ${existingGigs.length.toString().padStart(6)}`,
    );
    console.log(
      `║ Final stored          │ ${mergedPosts.length.toString().padStart(6)}`,
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

    if (mergedPosts.length > 0) {
      console.log("\nSample posts:");
      for (const p of mergedPosts.slice(0, 10)) {
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
