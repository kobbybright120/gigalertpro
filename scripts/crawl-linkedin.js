// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — LinkedIn Gig Crawler (via DuckDuckGo Lite + Bing + Google)
//
// Searches DuckDuckGo Lite, Bing, and Google for public LinkedIn posts
// containing freelance gig keywords. Uses plain HTTP fetch (no browser).
// No LinkedIn login required — all posts are publicly indexed.
// ─────────────────────────────────────────────────────────────────────────────

import { notifyUsersOfNewGigs } from "./lib/email-notifier.js";

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
  // Sample a subset of roles per run for time budget (~40 queries @ 12-20s = 8-13 min)
  // Full role coverage is maintained over multiple runs via randomization
  const ROLES_PER_RUN = parseInt(process.env.LI_ROLES_PER_RUN || "20", 10);
  const shuffledRoles = [...ROLES].sort(() => Math.random() - 0.5);
  const selectedRoles = shuffledRoles.slice(0, ROLES_PER_RUN);

  const queries = [];
  for (const role of selectedRoles) {
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

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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
      try { url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]); } catch {}
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

    const text = cleanSearchText(decodeHtmlEntities(
      context
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
    ));

    if (text.length < 20) continue;

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
      url: normalizedUrl,
      text: text.slice(0, 500),
      dateText,
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

    if (html.includes("/sorry/") || html.includes("captcha") || html.includes("unusual traffic")) {
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
];

function isValidPostUrl(url) {
  if (!url || !url.includes("linkedin.com")) return false;
  for (const rx of REJECT_URL_PATTERNS) {
    if (rx.test(url)) return false;
  }
  return true;
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
      `Generated ${searchQueries.length} search queries (${searchQueries.length / 2} sampled roles × 2 signals, from ${ROLES.length} total)`,
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
          console.log(`  [cooldown] Retrying ${eng.name} after ${Math.round(elapsed / 1000)}s cooldown`);
        }

        results = await eng.fn(search);
        if (results === null) {
          if (state) {
            state.retried = true;
            console.log(`  ${eng.name} blocked again after retry — permanently blocked`);
          } else {
            engineState.set(eng.name, { blockedAt: Date.now(), retried: false });
            console.log(`  ${eng.name} blocked — cooling down (60-90s before retry)`);
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
        (e) => engineState.get(e.name)?.retried === true
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
          console.warn("[li-crawler] Refreshed TTL on existing Redis data (2h)");
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

    // ── 8. Filter new posts ──
    // LinkedIn snippets from search engines are too thin for the AI classifier
    // (which was designed for Reddit's rich post content). Instead, use a
    // lightweight keyword filter: the search queries already provide strong
    // hiring signal ("role" + hiring/wanted/needed site:linkedin.com), so we
    // only reject obvious false positives like self-promotion.
    let classifiedNew = newPosts;
    if (newPosts.length > 0) {
      classifiedNew = newPosts.filter((p) => {
        const text = (p.text || "").toLowerCase();
        // Reject obvious self-promotion / non-gig patterns
        const rejectPatterns = [
          /\bi(?:'m| am) a (?:developer|designer|writer|editor|freelancer)\b/,
          /\bhire me\b/,
          /\bportfolio inside\b/,
          /\bavailable for (?:work|projects|hire)\b/,
          /\bmy (?:portfolio|services|work)\b/,
          /\btaking on (?:new )? clients\b/,
          /\bdms? open\b/,
          /\boffering (?:my )?services\b/,
          /\bi (?:specialize|build|design|write|develop|create)\b/,
          /\bopen for commissions\b/,
          /\b(?:developer|designer|writer|editor) here\b/,
          /\bcheck out my\b/,
          /\b\d+\+? (?:projects?|clients?) completed\b/,
        ];
        for (const rx of rejectPatterns) {
          if (rx.test(text)) return false;
        }
        return true;
      });

      const rejected = newPosts.length - classifiedNew.length;
      console.log(
        `Keyword filter: kept ${classifiedNew.length}/${newPosts.length} new posts${rejected > 0 ? ` (rejected ${rejected} self-promotion)` : ""}`,
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
      console.warn("[li-crawler] 0 posts after merge — skipping Redis write to preserve last-good data");
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
      console.warn("[li-crawler] Email notification error (non-fatal):", err.message);
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
      `║ New (filtered)        │ ${classifiedNew.length.toString().padStart(6)}`,
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
