#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Community Gig Monitor (Craigslist)
//
// Fetches REAL community gig posts from Craigslist gigs section
// (computer, creative, writing, all gigs).
//
// 100% free, no API keys required.
// Stores results in Upstash Redis for the API endpoint to serve.
// ─────────────────────────────────────────────────────────────────────────────

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

// ── Config ───────────────────────────────────────────────────────────────────

const REDIS_KEY = process.env.X_REDIS_KEY || "gigalertpro:x:latest";
const REDIS_TTL = parseInt(process.env.X_REDIS_TTL || "1200", 10); // 20 min
const MAX_POSTS = parseInt(process.env.X_MAX_POSTS || "300", 10);

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

// ── Fetch All & Deduplicate ──────────────────────────────────────────────────

async function fetchAllPosts() {
  const diagnostics = { craigslist: [] };

  // ── Craigslist ──
  console.log("\n[fetcher] === Craigslist Gigs ===");
  const cl = await fetchAllCraigslist();
  diagnostics.craigslist = cl.diagnostics;
  console.log(`[fetcher] Craigslist: ${cl.posts.length} fetched`);

  // Deduplicate
  const seen = new Set();
  const allPosts = [];
  for (const p of cl.posts) {
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[fetcher] Starting community gig monitor...");
  console.log(
    `[fetcher] Craigslist cities: ${CL_CITIES.length}, categories: ${CL_CATEGORIES.length}`,
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

  const payload = JSON.stringify({
    posts: allPosts,
    cached_at: new Date().toISOString(),
    post_count: allPosts.length,
    feed: "x-cached",
    diagnostics,
  });

  console.log(
    `\n[fetcher] Storing ${(payload.length / 1024).toFixed(0)} KB in Upstash...`,
  );
  await redisSet(REDIS_KEY, payload, REDIS_TTL);

  console.log(
    `[fetcher] ✅ Done. ${allPosts.length} posts stored (TTL ${REDIS_TTL}s)`,
  );
}

main().catch((err) => {
  console.error("[fetcher] Fatal error:", err);
  process.exit(1);
});
