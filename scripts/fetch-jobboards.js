#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Job Board Scanner
//
// Fetches freelance/contract gig posts from specialized job boards:
//   1. RemoteOK (RSS feeds)
//   2. Wellfound / AngelList (HTML scraping)
//   3. WorkingNomads (RSS feeds)
//   4. OpenQuant (HTML scraping)
//
// AI FILTER: Uses GPT-4o-mini to keep only genuine freelance/contract roles.
// Stores results in Upstash Redis for the API endpoint to serve.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyAndFilter } from "./gig-classifier.js";

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

// ── Config ───────────────────────────────────────────────────────────────────

const REDIS_KEY =
  process.env.JOBBOARDS_REDIS_KEY || "gigalertpro:jobboards:latest";
const REDIS_TTL = parseInt(process.env.JOBBOARDS_REDIS_TTL || "10800", 10); // 3 hours
const MAX_POSTS = parseInt(process.env.JOBBOARDS_MAX_POSTS || "300", 10);
const SEEN_KEY = "gigalertpro:seen:jobboards";
const SEEN_TTL = 86400; // 24 hours

const REQUEST_DELAY_MS = 600;
const FETCH_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Upstash Redis REST ───────────────────────────────────────────────────────

function redisUrl() {
  return (UPSTASH_REDIS_REST_URL || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
}
function redisToken() {
  return (UPSTASH_REDIS_REST_TOKEN || "").trim().replace(/^["']+|["']+$/g, "");
}

async function redisGet(key) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) return null;
  try {
    const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.result || null;
  } catch {
    return null;
  }
}

async function redisSet(key, value, ttlSeconds) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", key, value, "EX", ttlSeconds]),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* best effort */
  }
}

async function redisSadd(key, members, ttl) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token || members.length === 0) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SADD", key, ...members]),
      signal: AbortSignal.timeout(5000),
    });
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EXPIRE", key, ttl]),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* best effort */
  }
}

async function redisSmembers(key) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) return new Set();
  try {
    const resp = await fetch(`${url}/smembers/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return new Set();
    const json = await resp.json();
    return new Set(json.result || []);
  } catch {
    return new Set();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlText(xml, tag) {
  const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(rx);
  return m ? m[1].trim() : "";
}

async function fetchWithRetry(url, opts = {}, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": CHROME_UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...opts.headers,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
        ...opts,
      });
      if (resp.status === 429) {
        const wait = Math.pow(2, i) * 1000 + Math.random() * 500;
        console.warn(
          `[jobboards] 429 from ${url}, backing off ${Math.round(wait)}ms`,
        );
        await sleep(wait);
        continue;
      }
      return resp;
    } catch (err) {
      if (i === retries - 1) {
        console.warn(
          `[jobboards] Failed after ${retries} retries: ${url} — ${err.message}`,
        );
        return null;
      }
      await sleep(Math.pow(2, i) * 500);
    }
  }
  return null;
}

// ── Score a job board post (aligned with redditClient.js scoring) ─────────

function scorePost(post) {
  let score = 30; // base score for job board posts (higher base = curated source)

  const title = (post.title || "").toLowerCase();
  const body = (post.selftext || "").toLowerCase();
  const combined = title + " " + body;

  // Budget signals
  if (post.compensation || /\$[\d,]+/.test(combined)) score += 15;
  if (/\b(budget|pay|rate|salary|compensation)\b/.test(combined)) score += 8;

  // Contract/freelance signals
  if (/\b(freelance|contract|part[- ]?time|remote)\b/.test(combined))
    score += 10;

  // Urgency signals
  if (/\b(asap|urgent|immediately|start now)\b/.test(combined)) score += 8;

  // Specificity signals
  if (title.length > 40) score += 5;
  if (body.length > 100) score += 5;

  // Company mentioned
  if (post.company && post.company !== "unknown") score += 5;

  return Math.min(score, 100);
}

// ── Source 1: RemoteOK RSS ───────────────────────────────────────────────────

const REMOTEOK_FEEDS = [
  "https://remoteok.com/remote-dev-jobs.rss",
  "https://remoteok.com/remote-design-jobs.rss",
  "https://remoteok.com/remote-writing-jobs.rss",
  "https://remoteok.com/remote-marketing-jobs.rss",
];

// Max age: 7 days — anything older is too stale for freelancers
const REMOTEOK_MAX_AGE_SEC = 7 * 86400;

// Reject permanent full-time roles — we only want contract/freelance/part-time
const PERMANENT_REJECTION_PATTERNS = [
  /\bfull[- ]?time employee\b/i,
  /\bpermanent position\b/i,
  /\bbenefits package\b/i,
  /\bhealth insurance\b/i,
  /\b401\(?k\)?\b/i,
  /\bequity\b/i,
  /\bstock options?\b/i,
  /\bvesting\b/i,
  /\bPTO\b/,
  /\bdental\b.*\bvision\b/i,
];

// Positive signals — at least one must match (or title itself implies contract)
const CONTRACT_SIGNALS = [
  /\b(contract|freelance|part[- ]?time|consulting|consultant|contractor|temporary|temp|gig|per[- ]?diem)\b/i,
  /\b(project[- ]?based|fixed[- ]?term|hourly|retainer|remote[- ]?contract)\b/i,
];

function isContractRole(title, body) {
  const combined = (title + " " + body).toLowerCase();

  // Hard reject if permanent employment language is present
  for (const rx of PERMANENT_REJECTION_PATTERNS) {
    if (rx.test(combined)) return false;
  }

  // Accept if any contract/freelance signal is present
  for (const rx of CONTRACT_SIGNALS) {
    if (rx.test(combined)) return true;
  }

  // Default: reject (most RemoteOK listings are full-time permanent roles)
  return false;
}

async function fetchRemoteOK() {
  const allPosts = [];
  const nowSec = Math.floor(Date.now() / 1000);

  for (const feedUrl of REMOTEOK_FEEDS) {
    try {
      const resp = await fetchWithRetry(feedUrl, {
        headers: { Accept: "application/rss+xml, text/xml, */*" },
      });
      if (!resp || !resp.ok) {
        console.warn(
          `[jobboards] RemoteOK ${feedUrl}: HTTP ${resp?.status || "null"}`,
        );
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      const xml = await resp.text();

      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      let feedCount = 0;
      let skippedStale = 0;
      let skippedPermanent = 0;

      while ((match = itemRegex.exec(xml)) !== null) {
        const entry = match[1];
        const title = stripHtml(xmlText(entry, "title"));
        const link = stripHtml(xmlText(entry, "link"));
        const description = stripHtml(xmlText(entry, "description"));
        const pubDate = xmlText(entry, "pubDate");
        const company = stripHtml(xmlText(entry, "company")) || null;
        const salary = stripHtml(xmlText(entry, "salary")) || null;

        if (!title || !link) continue;

        // Freshness filter: skip posts older than 7 days
        const createdUtc = pubDate
          ? Math.floor(new Date(pubDate).getTime() / 1000)
          : nowSec;
        if (nowSec - createdUtc > REMOTEOK_MAX_AGE_SEC) {
          skippedStale++;
          continue;
        }

        // Contract/freelance filter: reject permanent full-time roles
        if (!isContractRole(title, description)) {
          skippedPermanent++;
          continue;
        }

        const id = `remoteok_${link.replace(/[^a-z0-9]/gi, "_").slice(-60)}`;
        allPosts.push({
          id,
          name: id,
          title,
          selftext: description.slice(0, 2000),
          author: company || "RemoteOK",
          author_name: company || "RemoteOK",
          permalink: link,
          subreddit: null,
          created_utc: createdUtc,
          num_comments: 0,
          ups: 0,
          link_flair_text: "RemoteOK",
          compensation: salary,
          company: company,
          employment_type: "contract",
          location: "Remote",
          _sub: "remoteok",
          source: "remoteok",
          source_platform: "RemoteOK",
        });
        feedCount++;
      }
      console.log(
        `[jobboards] RemoteOK ${feedUrl.split("/").pop()}: ${feedCount} kept, ${skippedStale} stale, ${skippedPermanent} permanent skipped`,
      );
    } catch (err) {
      console.warn(`[jobboards] RemoteOK error (${feedUrl}):`, err.message);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return allPosts;
}

// ── Source 2: Wellfound (AngelList) ──────────────────────────────────────────
// Wellfound is a React SPA behind Cloudflare — requires Playwright.
// A separate script (scripts/crawl-wellfound.js) writes to gigalertpro:wellfound:latest.
// This function just reads that Redis key to merge into the combined feed.

const WELLFOUND_REDIS_KEY = "gigalertpro:wellfound:latest";

async function fetchWellfound() {
  try {
    const raw = await redisGet(WELLFOUND_REDIS_KEY);
    if (!raw) {
      console.log(
        "[jobboards] Wellfound: no data in Redis (crawler hasn't run yet)",
      );
      return [];
    }
    const data = JSON.parse(raw);
    const posts = data.posts || [];
    console.log(
      `[jobboards] Wellfound: ${posts.length} posts from Redis cache`,
    );
    return posts;
  } catch (err) {
    console.warn("[jobboards] Wellfound Redis read error:", err.message);
    return [];
  }
}

// ── Source 3: WorkingNomads JSON API ─────────────────────────────────────────
// RSS feeds return HTML (Angular app). The JSON API works reliably.

async function fetchWorkingNomads() {
  const allPosts = [];
  try {
    const resp = await fetchWithRetry(
      "https://www.workingnomads.com/api/exposed_jobs/",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": CHROME_UA,
        },
      },
    );
    if (!resp || !resp.ok) {
      console.warn(
        `[jobboards] WorkingNomads API: HTTP ${resp?.status || "null"}`,
      );
      return allPosts;
    }
    const jobs = await resp.json();
    if (!Array.isArray(jobs)) {
      console.warn("[jobboards] WorkingNomads API: unexpected response format");
      return allPosts;
    }

    for (const job of jobs) {
      const title = (job.title || "").trim();
      const link = (job.url || "").trim();
      const description = stripHtml(job.description || "");
      const company = (job.company_name || "").trim() || null;
      const category = (job.category_name || "").trim();
      const pubDate = job.pub_date || "";
      const location = (job.location || "Remote").trim();
      const tags = job.tags || "";

      if (!title || !link) continue;

      const id = `workingnomads_${link.replace(/[^a-z0-9]/gi, "_").slice(-60)}`;
      allPosts.push({
        id,
        name: id,
        title,
        selftext: description.slice(0, 2000),
        author: company || "WorkingNomads",
        author_name: company || "WorkingNomads",
        permalink: link,
        subreddit: null,
        created_utc: pubDate
          ? Math.floor(new Date(pubDate).getTime() / 1000)
          : Math.floor(Date.now() / 1000),
        num_comments: 0,
        ups: 0,
        link_flair_text: "WorkingNomads",
        compensation: null,
        company: company,
        employment_type: null,
        location: location,
        _sub: "workingnomads",
        source: "workingnomads",
        source_platform: "WorkingNomads",
      });
    }

    console.log(
      `[jobboards] WorkingNomads: ${allPosts.length} posts from API (${jobs.length} total)`,
    );
  } catch (err) {
    console.warn("[jobboards] WorkingNomads error:", err.message);
  }
  return allPosts;
}

// ── Source 4: OpenQuant ──────────────────────────────────────────────────────
// OpenQuant is a Next.js app — job data is embedded in __NEXT_DATA__ JSON.

async function fetchOpenQuant() {
  const posts = [];
  try {
    const resp = await fetchWithRetry("https://openquant.co/jobs", {
      headers: { Accept: "text/html" },
    });
    if (!resp || !resp.ok) {
      console.warn(`[jobboards] OpenQuant: HTTP ${resp?.status || "null"}`);
      return posts;
    }
    const html = await resp.text();

    // Extract __NEXT_DATA__ JSON
    const nextDataIdx = html.indexOf("__NEXT_DATA__");
    if (nextDataIdx === -1) {
      console.warn("[jobboards] OpenQuant: no __NEXT_DATA__ found");
      return posts;
    }
    const jsonStart = html.indexOf(">", nextDataIdx) + 1;
    const jsonEnd = html.indexOf("</script>", jsonStart);
    const nextData = JSON.parse(html.slice(jsonStart, jsonEnd));

    const jobs = nextData?.props?.pageProps?.data || [];
    if (!Array.isArray(jobs) || jobs.length === 0) {
      console.warn("[jobboards] OpenQuant: no jobs in __NEXT_DATA__");
      return posts;
    }

    for (const job of jobs) {
      const title = (job.Position || "").trim();
      const company = (job.CompanyName || "OpenQuant").trim();
      const positionType = (job.PositionType || "").trim();
      const seniority = (job.Seniority || "").trim();
      const location = (job.Location || "").trim();
      const country = (job.Country || "").trim();
      const appUrl = (job.ApplicationUrl || "").trim();
      const datePosted = (job.PostedDate || "").trim();
      const skills = (job.Skills || "").trim();
      const minSalary = job.MinSalary;
      const maxSalary = job.MaxSalary;
      const salaryEstimated = job.SalaryEstimated;

      if (!title) continue;

      // Build description from available fields
      const descParts = [];
      if (positionType) descParts.push(`Role: ${positionType}`);
      if (seniority) descParts.push(`Level: ${seniority}`);
      if (skills) descParts.push(`Skills: ${skills}`);
      if (location) descParts.push(`Location: ${location}`);
      const description = descParts.join(" | ");

      // Build salary string
      let compensation = null;
      if (minSalary && maxSalary) {
        compensation = `$${minSalary.toLocaleString()}-$${maxSalary.toLocaleString()}${salaryEstimated ? " (est.)" : ""}`;
      }

      const permalink = appUrl || `https://openquant.co/jobs`;
      const id = `openquant_${(job.ID || permalink).replace(/[^a-z0-9]/gi, "_").slice(-60)}`;

      posts.push({
        id,
        name: id,
        title: `${title} at ${company}`,
        selftext: description.slice(0, 2000),
        author: company,
        author_name: company,
        permalink: permalink,
        subreddit: null,
        created_utc: datePosted
          ? Math.floor(new Date(datePosted).getTime() / 1000)
          : Math.floor(Date.now() / 1000),
        num_comments: 0,
        ups: 0,
        link_flair_text: "OpenQuant",
        compensation: compensation,
        company: company,
        employment_type: positionType || null,
        location: location || country || null,
        _sub: "openquant",
        source: "openquant",
        source_platform: "OpenQuant",
      });
    }

    console.log(
      `[jobboards] OpenQuant: ${posts.length} posts from __NEXT_DATA__ (${jobs.length} total)`,
    );
  } catch (err) {
    console.warn("[jobboards] OpenQuant error:", err.message);
  }
  return posts;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[jobboards] Starting job board scan...");

  // Load already-seen post IDs to avoid re-classifying
  const seenIds = await redisSmembers(SEEN_KEY);
  console.log(`[jobboards] ${seenIds.size} previously seen post IDs loaded`);

  // Fetch from all sources
  const [remoteOK, wellfound, workingNomads, openQuant] = await Promise.all([
    fetchRemoteOK(),
    fetchWellfound(),
    fetchWorkingNomads(),
    fetchOpenQuant(),
  ]);

  const allRaw = [...remoteOK, ...wellfound, ...workingNomads, ...openQuant];
  console.log(
    `[jobboards] Total raw posts: ${allRaw.length} (RemoteOK: ${remoteOK.length}, Wellfound: ${wellfound.length}, WorkingNomads: ${workingNomads.length}, OpenQuant: ${openQuant.length})`,
  );

  // Dedup by ID
  const seen = new Set();
  const unique = [];
  for (const p of allRaw) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      unique.push(p);
    }
  }
  console.log(`[jobboards] After dedup: ${unique.length}`);

  // Filter out already-classified posts
  const newPosts = unique.filter((p) => !seenIds.has(p.id));
  const existingPosts = unique.filter((p) => seenIds.has(p.id));
  console.log(
    `[jobboards] New posts to classify: ${newPosts.length}, already seen: ${existingPosts.length}`,
  );

  // AI classification — only classify new posts
  let classifiedNew = newPosts;
  if (newPosts.length > 0) {
    classifiedNew = await classifyAndFilter(newPosts);
    console.log(
      `[jobboards] After AI filter: ${classifiedNew.length} real gigs from ${newPosts.length} new posts`,
    );
  }

  // Mark new posts as seen
  const newIds = newPosts.map((p) => p.id);
  if (newIds.length > 0) {
    await redisSadd(SEEN_KEY, newIds, SEEN_TTL);
  }

  // Merge with existing data from Redis (keep posts from previous runs)
  let existingData = [];
  const cached = await redisGet(REDIS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      existingData = parsed.posts || [];
    } catch {
      /* ignore */
    }
  }

  // Safety net: if the post cache expired (3h TTL) but the seen-set still
  // remembers all IDs (24h TTL), we'd store 0 posts.  Re-classify so the
  // feed is never empty while sources still return data.
  if (classifiedNew.length === 0 && existingData.length === 0 && unique.length > 0) {
    console.log(
      `[jobboards] Cache expired but seen-set active — re-classifying ${unique.length} posts`,
    );
    classifiedNew = await classifyAndFilter(unique);
    console.log(
      `[jobboards] Re-classification: ${classifiedNew.length} real gigs from ${unique.length} posts`,
    );
  }

  // Combine: new classified + existing cached
  const mergedMap = new Map();
  for (const p of existingData) mergedMap.set(p.id, p);
  for (const p of classifiedNew) {
    // Score each post
    p.score = scorePost(p);
    mergedMap.set(p.id, p);
  }

  // Drop posts older than 30 days
  const MAX_AGE = 30 * 86400;
  const nowSec = Math.floor(Date.now() / 1000);
  let final = [...mergedMap.values()].filter(
    (p) => !p.created_utc || nowSec - p.created_utc < MAX_AGE,
  );

  // Sort newest first, cap at MAX_POSTS
  final.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));
  final = final.slice(0, MAX_POSTS);

  // Store in Redis
  const payload = JSON.stringify({
    posts: final,
    cached_at: new Date().toISOString(),
    post_count: final.length,
    feed: "jobboards",
    sources: {
      remoteok: remoteOK.length,
      wellfound: wellfound.length,
      workingnomads: workingNomads.length,
      openquant: openQuant.length,
    },
  });

  await redisSet(REDIS_KEY, payload, REDIS_TTL);
  console.log(
    `[jobboards] ✅ Stored ${final.length} job board posts in Redis (TTL: ${REDIS_TTL}s)`,
  );
}

main().catch((err) => {
  console.error("[jobboards] Fatal error:", err);
  process.exit(1);
});
