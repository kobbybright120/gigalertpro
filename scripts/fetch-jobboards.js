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
const FETCH_TIMEOUT_MS = 8000;
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

async function fetchRemoteOK() {
  const allPosts = [];
  for (const feedUrl of REMOTEOK_FEEDS) {
    try {
      const resp = await fetchWithRetry(feedUrl, {
        headers: { Accept: "application/rss+xml, text/xml, */*" },
      });
      if (!resp || !resp.ok) {
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      const xml = await resp.text();

      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const entry = match[1];
        const title = stripHtml(xmlText(entry, "title"));
        const link = stripHtml(xmlText(entry, "link"));
        const description = stripHtml(xmlText(entry, "description"));
        const pubDate = xmlText(entry, "pubDate");
        const company = stripHtml(xmlText(entry, "company")) || null;
        const salary = stripHtml(xmlText(entry, "salary")) || null;

        if (!title || !link) continue;

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
          created_utc: pubDate
            ? Math.floor(new Date(pubDate).getTime() / 1000)
            : Math.floor(Date.now() / 1000),
          num_comments: 0,
          ups: 0,
          link_flair_text: "RemoteOK",
          compensation: salary,
          company: company,
          employment_type: null,
          location: "Remote",
          _sub: "remoteok",
          source: "remoteok",
          source_platform: "RemoteOK",
        });
      }
      console.log(
        `[jobboards] RemoteOK ${feedUrl.split("/").pop()}: ${allPosts.length} posts`,
      );
    } catch (err) {
      console.warn(`[jobboards] RemoteOK error (${feedUrl}):`, err.message);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return allPosts;
}

// ── Source 2: Wellfound (AngelList) ──────────────────────────────────────────

async function fetchWellfound() {
  const posts = [];
  try {
    const resp = await fetchWithRetry("https://wellfound.com/jobs", {
      headers: { Accept: "text/html" },
    });
    if (!resp || !resp.ok) return posts;
    const html = await resp.text();

    // Extract job listings from the page HTML
    // Wellfound renders job cards with structured data
    const jobRegex =
      /<div[^>]*class="[^"]*styles_jobListing[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

    // Try to find JSON-LD structured data first (more reliable)
    const jsonLdRegex =
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let jsonMatch;
    while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const jobs =
          data["@type"] === "ItemList"
            ? data.itemListElement || []
            : data["@type"] === "JobPosting"
              ? [data]
              : [];
        for (const job of jobs) {
          const item = job.item || job;
          if (item["@type"] !== "JobPosting") continue;

          const title = item.title || "";
          const desc = stripHtml(item.description || "");
          const company = item.hiringOrganization?.name || "Wellfound";
          const url = item.url || "https://wellfound.com/jobs";
          const datePosted = item.datePosted || "";
          const salary = item.baseSalary?.value?.value
            ? `$${item.baseSalary.value.value}`
            : item.baseSalary?.value?.minValue &&
                item.baseSalary?.value?.maxValue
              ? `$${item.baseSalary.value.minValue}-$${item.baseSalary.value.maxValue}`
              : null;

          // Filter: only remote/freelance/contract roles
          const combined = (title + " " + desc).toLowerCase();
          const isRelevant =
            /\b(freelance|contract|part[- ]?time|remote|consultant)\b/.test(
              combined,
            );
          if (!isRelevant) continue;

          const id = `wellfound_${url.replace(/[^a-z0-9]/gi, "_").slice(-60)}`;
          posts.push({
            id,
            name: id,
            title,
            selftext: desc.slice(0, 2000),
            author: company,
            author_name: company,
            permalink: url,
            subreddit: null,
            created_utc: datePosted
              ? Math.floor(new Date(datePosted).getTime() / 1000)
              : Math.floor(Date.now() / 1000),
            num_comments: 0,
            ups: 0,
            link_flair_text: "Wellfound",
            compensation: salary,
            company: company,
            employment_type: "contract",
            location: "Remote",
            _sub: "wellfound",
            source: "wellfound",
            source_platform: "Wellfound",
          });
        }
      } catch {
        /* skip malformed JSON-LD */
      }
    }

    // Fallback: scrape basic job listing links from the page
    if (posts.length === 0) {
      const linkRegex = /<a[^>]*href="(\/jobs\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let linkMatch;
      const seen = new Set();
      while ((linkMatch = linkRegex.exec(html)) !== null && posts.length < 50) {
        const href = linkMatch[1];
        if (seen.has(href)) continue;
        seen.add(href);

        const innerText = stripHtml(linkMatch[2]);
        if (!innerText || innerText.length < 5) continue;

        const id = `wellfound_${href.replace(/[^a-z0-9]/gi, "_").slice(-60)}`;
        posts.push({
          id,
          name: id,
          title: innerText.slice(0, 200),
          selftext: "",
          author: "Wellfound",
          author_name: "Wellfound",
          permalink: `https://wellfound.com${href}`,
          subreddit: null,
          created_utc: Math.floor(Date.now() / 1000),
          num_comments: 0,
          ups: 0,
          link_flair_text: "Wellfound",
          compensation: null,
          company: null,
          employment_type: null,
          location: null,
          _sub: "wellfound",
          source: "wellfound",
          source_platform: "Wellfound",
        });
      }
    }

    console.log(`[jobboards] Wellfound: ${posts.length} posts`);
  } catch (err) {
    console.warn("[jobboards] Wellfound error:", err.message);
  }
  return posts;
}

// ── Source 3: WorkingNomads RSS ──────────────────────────────────────────────

const WORKINGNOMADS_FEEDS = [
  "https://www.workingnomads.com/jobs?category=development&format=rss",
  "https://www.workingnomads.com/jobs?category=design&format=rss",
  "https://www.workingnomads.com/jobs?category=writing&format=rss",
];

async function fetchWorkingNomads() {
  const allPosts = [];
  for (const feedUrl of WORKINGNOMADS_FEEDS) {
    try {
      const resp = await fetchWithRetry(feedUrl, {
        headers: { Accept: "application/rss+xml, text/xml, */*" },
      });
      if (!resp || !resp.ok) {
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      const xml = await resp.text();

      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const entry = match[1];
        const title = stripHtml(xmlText(entry, "title"));
        const link = stripHtml(xmlText(entry, "link"));
        const description = stripHtml(xmlText(entry, "description"));
        const pubDate = xmlText(entry, "pubDate");
        const company =
          stripHtml(
            xmlText(entry, "company") || xmlText(entry, "dc:creator"),
          ) || null;

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
          location: "Remote",
          _sub: "workingnomads",
          source: "workingnomads",
          source_platform: "WorkingNomads",
        });
      }
      console.log(
        `[jobboards] WorkingNomads ${feedUrl.split("category=")[1]?.split("&")[0]}: ${allPosts.length} posts`,
      );
    } catch (err) {
      console.warn(
        `[jobboards] WorkingNomads error (${feedUrl}):`,
        err.message,
      );
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return allPosts;
}

// ── Source 4: OpenQuant ──────────────────────────────────────────────────────

async function fetchOpenQuant() {
  const posts = [];
  try {
    const resp = await fetchWithRetry("https://openquant.co/jobs", {
      headers: { Accept: "text/html" },
    });
    if (!resp || !resp.ok) return posts;
    const html = await resp.text();

    // Try JSON-LD first
    const jsonLdRegex =
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let jsonMatch;
    while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const jobs =
          data["@type"] === "ItemList"
            ? data.itemListElement || []
            : Array.isArray(data)
              ? data
              : [data];
        for (const job of jobs) {
          const item = job.item || job;
          if (item["@type"] !== "JobPosting") continue;

          const title = item.title || "";
          const desc = stripHtml(item.description || "");
          const company = item.hiringOrganization?.name || "OpenQuant";
          const url = item.url || "https://openquant.co/jobs";
          const datePosted = item.datePosted || "";

          const id = `openquant_${url.replace(/[^a-z0-9]/gi, "_").slice(-60)}`;
          posts.push({
            id,
            name: id,
            title,
            selftext: desc.slice(0, 2000),
            author: company,
            author_name: company,
            permalink: url,
            subreddit: null,
            created_utc: datePosted
              ? Math.floor(new Date(datePosted).getTime() / 1000)
              : Math.floor(Date.now() / 1000),
            num_comments: 0,
            ups: 0,
            link_flair_text: "OpenQuant",
            compensation: null,
            company: company,
            employment_type: null,
            location: null,
            _sub: "openquant",
            source: "openquant",
            source_platform: "OpenQuant",
          });
        }
      } catch {
        /* skip malformed JSON-LD */
      }
    }

    // Fallback: scrape job links
    if (posts.length === 0) {
      const linkRegex = /<a[^>]*href="(\/jobs?\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let linkMatch;
      const seen = new Set();
      while ((linkMatch = linkRegex.exec(html)) !== null && posts.length < 50) {
        const href = linkMatch[1];
        if (seen.has(href)) continue;
        seen.add(href);

        const innerText = stripHtml(linkMatch[2]);
        if (!innerText || innerText.length < 5) continue;

        const id = `openquant_${href.replace(/[^a-z0-9]/gi, "_").slice(-60)}`;
        posts.push({
          id,
          name: id,
          title: innerText.slice(0, 200),
          selftext: "",
          author: "OpenQuant",
          author_name: "OpenQuant",
          permalink: `https://openquant.co${href}`,
          subreddit: null,
          created_utc: Math.floor(Date.now() / 1000),
          num_comments: 0,
          ups: 0,
          link_flair_text: "OpenQuant",
          compensation: null,
          company: null,
          employment_type: null,
          location: null,
          _sub: "openquant",
          source: "openquant",
          source_platform: "OpenQuant",
        });
      }
    }

    console.log(`[jobboards] OpenQuant: ${posts.length} posts`);
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
