#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — YouTube Gig Monitor (Invidious RSS)
//
// Fetches gig/hiring-related YouTube videos from Invidious RSS search feeds.
// Same architecture as fetch-x.js (Nitter for X/Twitter).
//
// AI FILTER: Uses GPT-4o-mini to classify posts as real gigs vs noise
// before storing. Tutorials, vlogs, and non-hiring content never reach users.
//
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

const REDIS_KEY = process.env.YT_REDIS_KEY || "gigalertpro:youtube:latest";
const REDIS_TTL = parseInt(process.env.YT_REDIS_TTL || "7200", 10); // 2 hours
const MAX_POSTS = parseInt(process.env.YT_MAX_POSTS || "300", 10);
const SEEN_KEY = "gigalertpro:seen:youtube";
const SEEN_TTL = 86400; // 24 hours

// Invidious instances to try (in priority order — fall through on failure)
const INVIDIOUS_INSTANCES = (
  process.env.INVIDIOUS_INSTANCES ||
  "yewtu.be,invidious.io,inv.nadeko.net,invidious.nerdvpn.de,vid.puffyan.us"
)
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

// Search queries — same 65 from fetch-x.js + YouTube-specific additions
const YOUTUBE_SEARCHES = (
  process.env.YOUTUBE_SEARCHES ||
  [
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
    "hiring machine learning engineer",
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
    "hiring sales freelancer",
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
    "hiring coach freelance",
    // ── General / Remote ──
    "freelance gig",
    "freelance opportunity",
    "remote freelance job",
    "looking for freelancer",
    "need a freelancer",
    "hiring freelancer",
    "remote job hiring",
    "contract work hiring",
    "part-time freelance",
    // ── YouTube-specific additions ──
    "need a youtube editor",
    "hiring youtube editor",
    "looking for video editor youtube",
    "need a thumbnail designer",
    "hiring podcast editor",
    "need a voice over artist",
    // ── Underrepresented niches ──
    "hiring music producer freelance",
    "hiring audio engineer freelance",
    "hiring sound designer freelance",
    "hiring photographer freelance",
    "hiring photo editor",
    "hiring translator freelance",
    "hiring transcriptionist freelance",
    "hiring tutor freelance",
    "hiring online teacher",
    "hiring shopify store manager",
    "hiring amazon listing expert",
    "hiring etsy shop designer",
    "hiring 3d modeler",
    "hiring UGC creator",
    "hiring no code developer",
    "hiring community manager discord",
    "hiring affiliate marketer",
  ].join(",")
)
  .split(",")
  .map((q) => q.trim())
  .filter(Boolean);

const INVIDIOUS_UA = "GigAlertPro/1.0 (+https://gigalertpro.com)";

// ── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms) {
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

// ── Invidious RSS fetcher ────────────────────────────────────────────────────

function parseInvidiousRss(xml, searchQuery) {
  const items = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const rawTitle = xmlText(entry, "title");
    const link =
      entry.match(/<link[^>]+href="([^"]+)"/i)?.[1] || xmlText(entry, "link");
    const description =
      xmlText(entry, "media:description") ||
      xmlText(entry, "description") ||
      xmlText(entry, "content") ||
      "";
    const pubDate = xmlText(entry, "published") || xmlText(entry, "updated");
    const author =
      xmlText(entry, "name") || xmlText(entry, "author") || "unknown";

    // Extract video ID from link
    const vidMatch =
      link.match(/[?&]v=([^&]+)/) || link.match(/\/watch\/([^?]+)/);
    const videoId = vidMatch ? vidMatch[1] : link;
    const body = stripHtml(description);
    const title = stripHtml(rawTitle).slice(0, 300);
    const createdUtc = pubDate
      ? Math.floor(new Date(pubDate).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    items.push({
      id: `yt_${videoId}`,
      name: `yt_${videoId}`,
      title,
      selftext: body.slice(0, 2000),
      author,
      author_name: author,
      permalink: youtubeUrl,
      subreddit: null,
      created_utc: createdUtc,
      num_comments: 0,
      ups: 0,
      link_flair_text: searchQuery,
      _sub: "youtube",
      source: `yt-search-${searchQuery.replace(/\s+/g, "-").toLowerCase()}`,
    });
  }

  // Also try RSS <item> format (some instances use RSS 2.0)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  while ((match = itemRegex.exec(xml)) !== null) {
    const entry = match[1];
    const rawTitle = xmlText(entry, "title");
    const link = xmlText(entry, "link");
    const description = xmlText(entry, "description") || "";
    const pubDate = xmlText(entry, "pubDate");
    const author =
      xmlText(entry, "dc:creator") || xmlText(entry, "author") || "unknown";

    const vidMatch =
      link.match(/[?&]v=([^&]+)/) || link.match(/\/watch\/([^?]+)/);
    const videoId = vidMatch ? vidMatch[1] : link;
    const body = stripHtml(description);
    const title = stripHtml(rawTitle).slice(0, 300);
    const createdUtc = pubDate
      ? Math.floor(new Date(pubDate).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Skip if already parsed from Atom format
    if (items.some((i) => i.id === `yt_${videoId}`)) continue;

    items.push({
      id: `yt_${videoId}`,
      name: `yt_${videoId}`,
      title,
      selftext: body.slice(0, 2000),
      author,
      author_name: author,
      permalink: youtubeUrl,
      subreddit: null,
      created_utc: createdUtc,
      num_comments: 0,
      ups: 0,
      link_flair_text: searchQuery,
      _sub: "youtube",
      source: `yt-search-${searchQuery.replace(/\s+/g, "-").toLowerCase()}`,
    });
  }

  return items;
}

async function fetchAllYouTube() {
  const allPosts = [];
  const diagnostics = [];
  let queriesAttempted = 0;
  let queriesSucceeded = 0;

  for (const query of YOUTUBE_SEARCHES) {
    queriesAttempted++;
    let fetched = false;

    for (const instance of INVIDIOUS_INSTANCES) {
      const url = `https://${instance}/feed/search?q=${encodeURIComponent(query)}&page=1`;
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": INVIDIOUS_UA,
            Accept: "application/atom+xml, application/rss+xml, text/xml",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(4000),
        });
        if (!resp.ok) continue;
        const xml = await resp.text();
        if (!xml.includes("<entry>") && !xml.includes("<item>")) continue;

        const posts = parseInvidiousRss(xml, query);
        allPosts.push(...posts);
        diagnostics.push({
          query,
          instance,
          count: posts.length,
          error: null,
        });
        queriesSucceeded++;
        fetched = true;
        break; // success — move to next query
      } catch {
        continue;
      }
    }
    if (!fetched) {
      diagnostics.push({
        query,
        instance: null,
        count: 0,
        error: "All instances failed",
      });
    }

    // Polite delay between queries
    await delay(300 + Math.random() * 200);
  }

  // Dedup by video ID
  const seen = new Set();
  const unique = [];
  for (const p of allPosts) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      unique.push(p);
    }
  }

  unique.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

  console.log(
    `[youtube] ${queriesSucceeded}/${queriesAttempted} queries succeeded, ${unique.length} unique posts`,
  );

  return {
    posts: unique.slice(0, MAX_POSTS),
    diagnostics,
    queriesAttempted,
    queriesSucceeded,
  };
}

// ── Redis helpers ────────────────────────────────────────────────────────────

async function redisGet(key) {
  const url = UPSTASH_REDIS_REST_URL.trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
  const token = UPSTASH_REDIS_REST_TOKEN.trim().replace(/^["']+|["']+$/g, "");
  try {
    const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.result || null;
  } catch {
    return null;
  }
}

async function redisSet(key, value, ttlSeconds) {
  const url = UPSTASH_REDIS_REST_URL.trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
  const token = UPSTASH_REDIS_REST_TOKEN.trim().replace(/^["']+|["']+$/g, "");
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", key, value, "EX", ttlSeconds]),
    signal: AbortSignal.timeout(3000),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Redis SET failed: ${resp.status} — ${body}`);
  }
}

async function redisSmembers(key) {
  const url = UPSTASH_REDIS_REST_URL.trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
  const token = UPSTASH_REDIS_REST_TOKEN.trim().replace(/^["']+|["']+$/g, "");
  try {
    const resp = await fetch(`${url}/smembers/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return new Set();
    const json = await resp.json();
    return new Set(json.result || []);
  } catch {
    return new Set();
  }
}

async function redisSadd(key, members, ttlSeconds) {
  const url = UPSTASH_REDIS_REST_URL.trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
  const token = UPSTASH_REDIS_REST_TOKEN.trim().replace(/^["']+|["']+$/g, "");
  if (members.length === 0) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SADD", key, ...members]),
      signal: AbortSignal.timeout(3000),
    });
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EXPIRE", key, ttlSeconds]),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* best effort */
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[youtube] Starting YouTube gig fetch...");

  // 1. Fetch raw posts
  const {
    posts: rawPosts,
    queriesAttempted,
    queriesSucceeded,
  } = await fetchAllYouTube();
  console.log(`[youtube] Fetched ${rawPosts.length} raw posts`);

  if (rawPosts.length === 0) {
    console.log("[youtube] No posts found — skipping Redis write");
    return;
  }

  // 2. Dedup against already-seen set
  const seen = await redisSmembers(SEEN_KEY);
  const newPosts = rawPosts.filter((p) => !seen.has(p.id));
  console.log(
    `[youtube] ${newPosts.length} new posts (${rawPosts.length - newPosts.length} already classified)`,
  );

  // 3. AI classify new posts
  let classified = newPosts;
  if (
    newPosts.length > 0 &&
    process.env.OPENAI_API_KEY &&
    typeof classifyAndFilter === "function"
  ) {
    try {
      classified = await classifyAndFilter(newPosts, "youtube");
      console.log(
        `[youtube] AI filter: ${classified.length}/${newPosts.length} posts kept`,
      );
    } catch (err) {
      console.warn("[youtube] AI filter failed, using all posts:", err.message);
      classified = newPosts;
    }
  }

  // 4. Mark new IDs as seen
  const newIds = newPosts.map((p) => p.id);
  if (newIds.length > 0) {
    await redisSadd(SEEN_KEY, newIds, SEEN_TTL);
  }

  // 5. Merge with existing Redis data (keep fresh posts from previous runs)
  let existing = [];
  try {
    const raw = await redisGet(REDIS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      existing = parsed.posts || [];
    }
  } catch {
    /* start fresh */
  }

  const mergedMap = new Map();
  for (const p of existing) mergedMap.set(p.id, p);
  for (const p of classified) mergedMap.set(p.id, p);

  // Drop posts older than 48 hours
  const cutoff = Math.floor(Date.now() / 1000) - 48 * 3600;
  const merged = [...mergedMap.values()]
    .filter((p) => (p.created_utc || 0) > cutoff)
    .sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0))
    .slice(0, MAX_POSTS);

  // 6. Write to Redis
  const payload = JSON.stringify({
    posts: merged,
    cached_at: new Date().toISOString(),
    post_count: merged.length,
    feed: "youtube-invidious",
    queries_attempted: queriesAttempted,
    queries_succeeded: queriesSucceeded,
    new_this_run: classified.length,
  });

  await redisSet(REDIS_KEY, payload, REDIS_TTL);
  console.log(
    `[youtube] Wrote ${merged.length} posts to Redis (${(payload.length / 1024).toFixed(1)} KB, TTL ${REDIS_TTL}s)`,
  );
}

main().catch((err) => {
  console.error("[youtube] Fatal:", err);
  process.exit(1);
});
