#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Community Gig Monitor (Craigslist + Nitter/X)
//
// Fetches REAL community gig posts from:
//   1. Craigslist gigs section (computer, creative, writing, all gigs)
//   2. X (Twitter) via Nitter RSS search feeds
//
// AI FILTER: Uses GPT-4o-mini to classify posts as real gigs vs noise
// before storing. Self-promos, rants, discussions, and spam never reach users.
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

const REDIS_KEY = process.env.X_REDIS_KEY || "gigalertpro:x:latest";
const REDIS_TTL = parseInt(process.env.X_REDIS_TTL || "3600", 10); // 1 hour safety net
const MAX_POSTS = parseInt(process.env.X_MAX_POSTS || "300", 10);
const SEEN_KEY = "gigalertpro:seen:x"; // dedup set — tracks classified post IDs
const SEEN_TTL = 86400; // 24 hours

// Craigslist cities to scan (subdomain format)
const CL_CITIES = (
  process.env.CL_CITIES ||
  "lasvegas,newyork,sfbay,losangeles,chicago,seattle,austin,denver,atlanta,boston"
)
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

// Craigslist gig categories: cpg=computer, crg=creative, wrg=writing, ggg=all gigs
const CL_CATEGORIES = (process.env.CL_CATEGORIES || "cpg,crg,wrg")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

const CL_CATEGORY_NAMES = {
  cpg: "Computer",
  crg: "Creative",
  wrg: "Writing",
  ggg: "Gigs",
  evg: "Event",
  lbg: "Labor",
};

// ── Nitter / X Config ────────────────────────────────────────────────────────

// Nitter instances to try (in priority order — fall through on failure)
const NITTER_INSTANCES = (
  process.env.NITTER_INSTANCES ||
  "nitter.perennialte.ch,xcancel.com,nitter.privacyredirect.com,nitter.net"
)
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

// Search queries for job/gig tweets (Nitter search RSS)
// ── Niche-based search queries mapped to freelance categories ──
const NITTER_SEARCHES = (
  process.env.NITTER_SEARCHES ||
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
    // ── Writing & Content ──
    "hiring copywriter",
    "hiring content writer",
    "hiring technical writer",
    "hiring ghostwriter",
    "hiring editor proofreader",
    "need a writer",
    "looking for blogger",
    // ── Marketing & Sales ──
    "hiring social media manager",
    "hiring SEO specialist",
    "hiring digital marketer",
    "hiring growth hacker",
    "hiring email marketer",
    "need a marketer",
    "hiring sales freelancer",
    // ── Business & Admin ──
    "hiring virtual assistant",
    "hiring data entry",
    "hiring project manager",
    "hiring customer support",
    "hiring executive assistant",
    "need a VA",
    "hiring bookkeeper",
    // ── Specialized Niches ──
    "hiring translator",
    "hiring voice actor",
    "hiring voiceover artist",
    "hiring music producer",
    "hiring photographer",
    "hiring 3D artist",
    "hiring transcriptionist",
    // ── General / Remote ──
    "freelance gig",
    "freelance opportunity",
    "remote freelance job",
    "looking for freelancer",
    "need a freelancer",
    "hiring freelancer",
    "remote job hiring",
  ].join(",")
)
  .split(",")
  .map((q) => q.trim())
  .filter(Boolean);

const NITTER_MAX_POSTS = parseInt(process.env.NITTER_MAX_POSTS || "200", 10);
const NITTER_UA = "GigAlertPro/1.0 (+https://gigalertpro.vercel.app)";

// ── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Source 1: Craigslist Gigs (Advanced — search + detail pages) ─────────────

const CL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// How many detail pages to fetch per city/category combo (top N newest)
const CL_DETAIL_LIMIT = parseInt(process.env.CL_DETAIL_LIMIT || "10", 10);
// Concurrent detail-page fetches
const CL_CONCURRENCY = parseInt(process.env.CL_CONCURRENCY || "5", 10);
// Max retries per request
const CL_MAX_RETRIES = 2;

/**
 * Fetch with retries + exponential backoff (mirrors Reddit fetcher pattern).
 */
async function clFetch(url, label) {
  for (let attempt = 0; attempt <= CL_MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": CL_UA, Accept: "text/html" },
        redirect: "follow",
      });

      if (resp.status === 429 || resp.status === 503) {
        const wait = Math.pow(2, attempt + 1) * 1000 + Math.random() * 500;
        console.warn(
          `  [craigslist] ${resp.status} on ${label}, retry ${attempt + 1} in ${(wait / 1000).toFixed(1)}s`,
        );
        await delay(wait);
        continue;
      }

      if (!resp.ok) {
        return { html: null, status: resp.status, error: resp.statusText };
      }

      const html = await resp.text();
      // Detect block pages (Craigslist returns 200 with a block message)
      if (html.includes("has been blocked") || html.includes("blocked")) {
        if (attempt < CL_MAX_RETRIES) {
          const wait = Math.pow(2, attempt + 2) * 1000;
          console.warn(
            `  [craigslist] Blocked on ${label}, retry ${attempt + 1} in ${(wait / 1000).toFixed(1)}s`,
          );
          await delay(wait);
          continue;
        }
        return { html: null, status: 403, error: "Blocked by Craigslist" };
      }

      return { html, status: resp.status, error: null };
    } catch (err) {
      if (attempt < CL_MAX_RETRIES) {
        await delay(1000 * (attempt + 1));
        continue;
      }
      return { html: null, status: 0, error: err.message };
    }
  }
  return { html: null, status: 0, error: "Max retries exceeded" };
}

/**
 * Parse Craigslist search results HTML — extract URL + title for each listing.
 */
function parseCraigslistSearchPage(html) {
  const listings = [];
  const re =
    /<a href="(https:\/\/[^"]+\.html)"[^>]*>[\s\S]*?<div class="title">([^<]+)<\/div>[\s\S]*?<\/a>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const url = match[1];
    const title = match[2].trim();
    const idMatch = url.match(/\/(\d+)\.html/);
    const id = idMatch ? idMatch[1] : url;
    listings.push({ id, url, title });
  }
  return listings;
}

/**
 * Parse a Craigslist detail page — extract real timestamp, body, compensation, location.
 */
function parseCraigslistDetailPage(html) {
  const result = {
    posted_at: null,
    body: "",
    compensation: null,
    location: null,
    employment_type: null,
  };

  // Real posted timestamp (e.g. datetime="2026-03-29T05:20:50-0700")
  const dateMatch = html.match(/datetime="(\d{4}-\d{2}-\d{2}T[^"]+)"/);
  if (dateMatch) {
    const d = new Date(dateMatch[1]);
    if (!isNaN(d.getTime())) {
      result.posted_at = Math.floor(d.getTime() / 1000);
    }
  }

  // Full body text from <section id="postingbody">
  const bodyMatch = html.match(
    /<section id="postingbody">([\s\S]*?)<\/section>/,
  );
  if (bodyMatch) {
    result.body = bodyMatch[1]
      .replace(/<[^>]*>/g, " ")
      .replace(/QR Code Link to This Post/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
  }

  // Compensation (e.g. "compensation: $25/hr")
  const compMatch = html.match(/compensation:<\/span>\s*([^<\n]+)/i);
  if (compMatch) result.compensation = compMatch[1].trim();

  // Employment type
  const empMatch = html.match(/employment type:<\/span>\s*([^<\n]+)/i);
  if (empMatch) result.employment_type = empMatch[1].trim();

  // Location from map address
  const locMatch = html.match(/<div class="mapaddress">([^<]+)<\/div>/);
  if (locMatch) result.location = locMatch[1].trim();

  // Fallback: area from title parenthetical
  if (!result.location) {
    const areaMatch = html.match(/<small>\s*\(([^)]+)\)\s*<\/small>/);
    if (areaMatch) result.location = areaMatch[1].trim();
  }

  return result;
}

/**
 * Fetch detail pages for a batch of listings with controlled concurrency.
 */
async function fetchDetailsBatch(listings, city, category) {
  const enriched = [];

  // Process in concurrent batches
  for (let i = 0; i < listings.length; i += CL_CONCURRENCY) {
    const batch = listings.slice(i, i + CL_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (listing) => {
        const { html, error } = await clFetch(
          listing.url,
          `${city}/${listing.id}`,
        );
        if (!html) return { listing, detail: null, error };
        const detail = parseCraigslistDetailPage(html);
        return { listing, detail, error: null };
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        const { listing, detail } = r.value;
        const realTimestamp =
          detail?.posted_at || Math.floor(Date.now() / 1000);
        const bodyText = detail?.body || listing.title;

        enriched.push({
          id: `cl_${listing.id}`,
          name: `cl_${listing.id}`,
          title: listing.title,
          selftext: bodyText,
          author: city,
          author_name: `${city} Craigslist`,
          permalink: listing.url,
          subreddit: null,
          created_utc: realTimestamp,
          num_comments: 0,
          ups: 0,
          link_flair_text: CL_CATEGORY_NAMES[category] || category,
          compensation: detail?.compensation || null,
          employment_type: detail?.employment_type || null,
          location: detail?.location || city,
          _sub: "craigslist",
          source: `cl-${city}-${category}`,
        });
      }
    }

    // Rate-limit pause between batches
    if (i + CL_CONCURRENCY < listings.length) await delay(400);
  }

  return enriched;
}

/**
 * Fetch listings for one city + category:
 *  1. Search page → listing URLs
 *  2. Detail pages (top N) → full body, real timestamps, compensation
 */
async function fetchCraigslistCity(city, category) {
  const searchUrl = `https://${city}.craigslist.org/search/${category}`;
  const { html, error } = await clFetch(
    searchUrl,
    `${city}/${category} search`,
  );

  if (!html) {
    return { posts: [], total: 0, error };
  }

  // Check for real content (not a JS-only shell or block page)
  if (!html.includes('<div class="title">')) {
    return {
      posts: [],
      total: 0,
      error: "No listings found (blocked or empty)",
    };
  }

  const listings = parseCraigslistSearchPage(html);
  if (listings.length === 0) {
    return { posts: [], total: 0, error: "0 listings parsed" };
  }

  // Fetch detail pages for the top N listings
  const toFetch = listings.slice(0, CL_DETAIL_LIMIT);
  console.log(
    `    → ${listings.length} listings found, fetching ${toFetch.length} detail pages`,
  );
  const enriched = await fetchDetailsBatch(toFetch, city, category);

  return { posts: enriched, total: listings.length, error: null };
}

async function fetchAllCraigslist() {
  const allPosts = [];
  const diagnostics = [];
  let totalListings = 0;
  let totalEnriched = 0;
  let blockedCities = 0;

  for (const city of CL_CITIES) {
    let cityBlocked = true;
    for (const cat of CL_CATEGORIES) {
      console.log(`  [craigslist] ${city}/${cat}`);
      const result = await fetchCraigslistCity(city, cat);
      allPosts.push(...result.posts);
      totalListings += result.total;
      totalEnriched += result.posts.length;

      if (result.posts.length > 0) cityBlocked = false;

      diagnostics.push({
        city,
        category: cat,
        total_on_page: result.total,
        enriched: result.posts.length,
        error: result.error,
      });

      // Polite delay between city/category combos
      await delay(600);
    }
    if (cityBlocked) blockedCities++;
  }

  if (blockedCities > 0) {
    console.warn(
      `  [craigslist] ⚠ ${blockedCities}/${CL_CITIES.length} cities returned 0 posts (possible IP block)`,
    );
  }

  console.log(
    `  [craigslist] Summary: ${totalListings} search results → ${totalEnriched} enriched with details`,
  );

  return { posts: allPosts, diagnostics };
}

// ── Source 2: Nitter / X (Twitter) RSS Feeds ─────────────────────────────────

/**
 * Strip HTML tags and decode entities from Nitter RSS content.
 */
function stripNitterHtml(html) {
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

/**
 * Extract text content from an XML tag.
 */
function nitterXmlText(xml, tag) {
  const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(rx);
  return m ? m[1].trim() : "";
}

/**
 * Parse Nitter RSS feed XML into normalized post objects.
 */
function parseNitterRss(xml, searchQuery) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const entry = match[1];

    const rawTitle = nitterXmlText(entry, "title");
    const link = nitterXmlText(entry, "link");
    const description = nitterXmlText(entry, "description");
    const pubDate = nitterXmlText(entry, "pubDate");
    const creator =
      nitterXmlText(entry, "dc:creator") ||
      nitterXmlText(entry, "creator") ||
      "";

    // Extract tweet ID from link (e.g. https://nitter.net/user/status/123456)
    const statusMatch = link.match(/\/status\/(\d+)/);
    const tweetId = statusMatch ? statusMatch[1] : link;

    // Clean the author handle
    const author = creator.replace(/^@/, "").trim() || "unknown";

    // Build plain-text body from description
    const body = stripNitterHtml(description);
    // Title from Nitter is usually "@user: tweet text..." — extract clean title
    const title = stripNitterHtml(rawTitle).slice(0, 300);

    const createdUtc = pubDate
      ? Math.floor(new Date(pubDate).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    // Convert nitter link to real twitter/x.com link
    const twitterUrl = link.replace(/https?:\/\/[^/]+/, "https://x.com").trim();

    items.push({
      id: `x_${tweetId}`,
      name: `x_${tweetId}`,
      title,
      selftext: body.slice(0, 2000),
      author,
      author_name: `@${author}`,
      permalink: twitterUrl,
      subreddit: null,
      created_utc: createdUtc,
      num_comments: 0,
      ups: 0,
      link_flair_text: searchQuery,
      compensation: null,
      employment_type: null,
      location: null,
      _sub: "nitter",
      source: `x-search-${searchQuery.replace(/\s+/g, "-").toLowerCase()}`,
    });
  }
  return items;
}

/**
 * Try fetching a URL from multiple Nitter instances with fallback.
 * Returns { xml, instance } on success, or { xml: null } on total failure.
 */
async function fetchNitterWithFallback(path, label) {
  for (const instance of NITTER_INSTANCES) {
    const url = `https://${instance}${path}`;
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": NITTER_UA,
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000), // 10s timeout per instance
      });

      if (resp.status === 429) {
        console.warn(`  [nitter] 429 on ${instance} for ${label}, trying next`);
        continue;
      }
      if (!resp.ok) {
        console.warn(
          `  [nitter] ${resp.status} on ${instance} for ${label}, trying next`,
        );
        continue;
      }

      const xml = await resp.text();

      // Check for empty, error, or whitelisting-block pages
      if (!xml.includes("<item>") && !xml.includes("<entry>")) {
        console.warn(
          `  [nitter] No items from ${instance} for ${label}, trying next`,
        );
        continue;
      }
      if (xml.includes("not yet whitelisted")) {
        console.warn(
          `  [nitter] ${instance} requires RSS whitelisting, trying next`,
        );
        continue;
      }

      return { xml, instance };
    } catch (err) {
      console.warn(
        `  [nitter] ${instance} failed for ${label}: ${err.message}`,
      );
      continue;
    }
  }
  return { xml: null, instance: null };
}

/**
 * Fetch all Nitter search feeds and return normalized posts.
 */
async function fetchAllNitter() {
  const allPosts = [];
  const diagnostics = [];
  let successCount = 0;

  for (const query of NITTER_SEARCHES) {
    const path = `/search/rss?f=tweets&q=${query.replace(/\s+/g, "+")}`;
    console.log(`  [nitter] Searching: "${query}"`);

    const { xml, instance } = await fetchNitterWithFallback(
      path,
      `search:${query}`,
    );

    if (xml) {
      const posts = parseNitterRss(xml, query);
      allPosts.push(...posts);
      successCount++;
      diagnostics.push({
        query,
        instance,
        count: posts.length,
        error: null,
      });
      console.log(`    → ${posts.length} tweets from ${instance}`);
    } else {
      diagnostics.push({
        query,
        instance: null,
        count: 0,
        error: "All instances failed",
      });
      console.warn(`    → All instances failed for "${query}"`);
    }

    // Polite delay between searches
    await delay(1500);
  }

  console.log(
    `  [nitter] Summary: ${successCount}/${NITTER_SEARCHES.length} searches succeeded, ${allPosts.length} tweets total`,
  );

  return { posts: allPosts, diagnostics };
}

// ── Fetch All & Deduplicate ──────────────────────────────────────────────────

async function fetchAllPosts() {
  const diagnostics = { craigslist: [], nitter: [] };

  // ── Craigslist ──
  console.log("\n[fetcher] === Craigslist Gigs ===");
  const cl = await fetchAllCraigslist();
  diagnostics.craigslist = cl.diagnostics;
  console.log(`[fetcher] Craigslist: ${cl.posts.length} fetched`);

  // ── Nitter / X ──
  console.log("\n[fetcher] === Nitter / X (Twitter) ===");
  const nitter = await fetchAllNitter();
  diagnostics.nitter = nitter.diagnostics;
  console.log(`[fetcher] Nitter: ${nitter.posts.length} fetched`);

  // Deduplicate across both sources
  const seen = new Set();
  const allPosts = [];
  for (const p of [...cl.posts, ...nitter.posts]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      allPosts.push(p);
    }
  }

  // Sort newest first, cap at MAX_POSTS
  allPosts.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

  return {
    allPosts: allPosts.slice(0, MAX_POSTS),
    diagnostics,
  };
}

// ── Upstash Redis (REST — zero dependencies) ────────────────────────────────

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
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Redis SET failed: ${resp.status} — ${body}`);
  }
  return resp.json();
}

// ── Dedup helpers — avoid re-classifying posts already seen ──────────────────

function redisUrl() {
  return UPSTASH_REDIS_REST_URL.trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
}
function redisToken() {
  return UPSTASH_REDIS_REST_TOKEN.trim().replace(/^["']+|["']+$/g, "");
}

async function redisPipeline(commands) {
  const resp = await fetch(`${redisUrl()}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function getSeenIds() {
  try {
    const resp = await fetch(redisUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SMEMBERS", SEEN_KEY]),
    });
    if (!resp.ok) return new Set();
    const data = await resp.json();
    return new Set(data.result || []);
  } catch {
    return new Set();
  }
}

async function markSeen(ids) {
  if (ids.length === 0) return;
  try {
    await redisPipeline([
      ["SADD", SEEN_KEY, ...ids],
      ["EXPIRE", SEEN_KEY, SEEN_TTL],
    ]);
  } catch {
    /* best effort */
  }
}

async function redisGet(key) {
  try {
    const resp = await fetch(redisUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["GET", key]),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.result || null;
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[fetcher] Starting community gig monitor...");
  console.log(
    `[fetcher] Craigslist cities: ${CL_CITIES.length}, categories: ${CL_CATEGORIES.length}`,
  );
  console.log(
    `[fetcher] Nitter instances: ${NITTER_INSTANCES.length}, searches: ${NITTER_SEARCHES.length}`,
  );

  const start = Date.now();
  const { allPosts, diagnostics } = await fetchAllPosts();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `\n[fetcher] Total: ${allPosts.length} unique posts in ${elapsed}s`,
  );

  if (allPosts.length === 0) {
    console.warn("[fetcher] 0 posts — skipping Redis write");
    process.exit(0);
  }

  // Log samples
  if (allPosts.length > 0) {
    console.log("\n[fetcher] Sample posts:");
    for (const p of allPosts.slice(0, 3)) {
      console.log(`  [${p._sub}] ${p.title.slice(0, 100)}`);
      console.log(`   → ${p.permalink}`);
    }
  }

  // ── Dedup: skip posts already classified in a previous run ──
  const seenIds = await getSeenIds();
  const newPosts = allPosts.filter((p) => !seenIds.has(p.id));
  const skipped = allPosts.length - newPosts.length;

  console.log(
    `[fetcher] Dedup: ${skipped} already seen, ${newPosts.length} new posts to classify`,
  );

  // ── AI Classification: only classify NEW posts ──
  let freshGigs = [];
  if (newPosts.length > 0) {
    freshGigs = await classifyAndFilter(newPosts);
    // Mark all fetched new IDs as seen (both gigs and non-gigs)
    await markSeen(newPosts.map((p) => p.id));
  }

  // ── Merge: read existing stored gigs and merge with fresh ones ──
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

  // Merge: fresh gigs + existing, dedup by ID, sort newest first, cap
  const mergedMap = new Map();
  for (const g of [...freshGigs, ...existingGigs]) {
    if (!mergedMap.has(g.id)) mergedMap.set(g.id, g);
  }
  const filteredPosts = [...mergedMap.values()]
    .sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0))
    .slice(0, MAX_POSTS);

  if (filteredPosts.length === 0) {
    console.warn("[fetcher] 0 posts after merge — skipping Redis write");
    process.exit(0);
  }

  const payload = JSON.stringify({
    posts: filteredPosts,
    cached_at: new Date().toISOString(),
    post_count: filteredPosts.length,
    feed: "x-cached",
    diagnostics,
  });

  console.log(
    `\n[fetcher] Storing ${(payload.length / 1024).toFixed(0)} KB in Upstash...`,
  );
  await redisSet(REDIS_KEY, payload, REDIS_TTL);

  console.log(
    `[fetcher] ✅ Done. ${filteredPosts.length} gigs stored (${freshGigs.length} new, ${skipped} skipped, TTL ${REDIS_TTL}s).`,
  );
}

main().catch((err) => {
  console.error("[fetcher] Fatal error:", err);
  process.exit(1);
});
