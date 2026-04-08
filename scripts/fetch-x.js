#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Community Gig Monitor (Craigslist + Nitter/X + Remotive)
//
// Fetches REAL community gig posts from:
//   1. Craigslist gigs section (computer, creative, writing, all gigs)
//   2. X (Twitter) via Nitter RSS search feeds
//   3. Threads.net (HTML scraping)
//   4. Remotive.com public API — reliable fallback, works from any IP
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
const REDIS_TTL = parseInt(process.env.X_REDIS_TTL || "25200", 10); // 7 hours — survives GitHub cron throttling
const MAX_POSTS = parseInt(process.env.X_MAX_POSTS || "300", 10);
const SEEN_KEY = "gigalertpro:seen:x"; // dedup set — tracks classified post IDs
const SEEN_TTL = 86400; // 24 hours

// Script-level deadline — abort slow sources before GitHub Actions kills the job.
// Must be less than the workflow timeout-minutes to leave time for classification + Redis write.
const SCRIPT_START = Date.now();
const SCRIPT_DEADLINE_MS = parseInt(
  process.env.SCRIPT_DEADLINE_MS || String(9 * 60 * 1000),
  10,
); // 9 min

// Craigslist cities to scan (subdomain format)
const CL_CITIES = (
  process.env.CL_CITIES ||
  "lasvegas,newyork,sfbay,losangeles,chicago,seattle,austin,denver,atlanta,boston"
)
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

// Craigslist gig categories: cpg=computer, crg=creative, wrg=writing, ggg=all gigs, evg=event
const CL_CATEGORIES = (process.env.CL_CATEGORIES || "cpg,crg,wrg,ggg")
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
  ].join(",")
)
  .split(",")
  .map((q) => q.trim())
  .filter(Boolean);

const NITTER_MAX_POSTS = parseInt(process.env.NITTER_MAX_POSTS || "200", 10);
const NITTER_UA = "GigAlertPro/1.0 (+https://gigalertpro.com)";

// ── Source 3: Threads.net Config (HTML Scraping — No API) ────────────────────

const THREADS_BASE = "https://www.threads.net";
const THREADS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"; // browser-like UA for Threads
const THREADS_MAX_POSTS = parseInt(process.env.THREADS_MAX_POSTS || "150", 10);
const THREADS_DETAIL_LIMIT = parseInt(
  process.env.THREADS_DETAIL_LIMIT || "8",
  10,
);
const THREADS_CONCURRENCY = parseInt(
  process.env.THREADS_CONCURRENCY || "3",
  10,
);
// Maximum age for Threads posts in days — anything older is stale and skipped.
const THREADS_MAX_AGE_DAYS = parseInt(
  process.env.THREADS_MAX_AGE_DAYS || "30",
  10,
);
const THREADS_MAX_AGE_S = THREADS_MAX_AGE_DAYS * 86400; // in seconds

// Hashtags to monitor (no # prefix)
const THREADS_TAGS = (
  process.env.THREADS_TAGS ||
  [
    // Core
    "hiring",
    "hiringnow",
    "nowhiring",
    "jobposting",
    "freelance",
    "freelancer",
    "freelancejobs",
    "remotejobs",
    "remotework",
    "forhire",
    // Niche hiring
    "hiringdesigner",
    "hiringdeveloper",
    "hiringwriter",
    "hiringeditor",
    "hiringvideoeditor",
    "hiringfreelancer",
    "hiringvideographer",
    "hiringsocialmediamanager",
    "hiringseospecialist",
    "hiringva",
    // Industry tags
    "graphicdesignjobs",
    "webdesignjobs",
    "contentwritingjobs",
    "videoeditorjobs",
    "socialmediajobs",
    "uxdesignjobs",
    "webdeveloperjobs",
    "copywriterjobs",
    "virtualassistantjobs",
    "photographyjobs",
  ].join(",")
)
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

// Search queries — short niche keywords that Threads search actually responds to.
// Threads does NOT support phrase search; single role/skill names return results.
// Client-side matching in redditClient.js handles further filtering by keyword intent.
const THREADS_SEARCHES = (
  process.env.THREADS_SEARCHES ||
  [
    // ── Video Editing ──────────────────────────────────────────────────────
    "video editor",
    "reels editor",
    "short form editor",
    "YouTube editor",
    "video editing",
    // ── Graphic Design ─────────────────────────────────────────────────────
    "graphic designer",
    "logo designer",
    "brand designer",
    "thumbnail designer",
    "illustrator",
    "UI designer",
    "UX designer",
    "UI/UX",
    // ── Web Development ────────────────────────────────────────────────────
    "web developer",
    "frontend developer",
    "backend developer",
    "full stack developer",
    "React developer",
    "WordPress developer",
    "Shopify developer",
    "Webflow developer",
    "Flutter developer",
    "iOS developer",
    "Android developer",
    "mobile developer",
    // ── Writing & Copywriting ──────────────────────────────────────────────
    "content writer",
    "copywriter",
    "ghostwriter",
    "SEO writer",
    "scriptwriter",
    "technical writer",
    "blog writer",
    "newsletter writer",
    // ── Social Media & Marketing ───────────────────────────────────────────
    "social media manager",
    "content creator",
    "digital marketer",
    "SEO specialist",
    "email marketer",
    "community manager",
    "PPC specialist",
    "Google Ads",
    "Facebook Ads",
    "influencer manager",
    // ── Virtual Assistant & Admin ──────────────────────────────────────────
    "virtual assistant",
    "executive assistant",
    "data entry",
    "customer support",
    "admin assistant",
    // ── Photography & Videography ──────────────────────────────────────────
    "photographer",
    "product photographer",
    "videographer",
    // ── Motion Graphics & Animation ────────────────────────────────────────
    "animator",
    "motion graphics",
    "2D animator",
    "3D artist",
    // ── Audio, Music & Podcast ─────────────────────────────────────────────
    "podcast editor",
    "voiceover artist",
    "voice actor",
    "music producer",
    "audio engineer",
    "sound designer",
    // ── Data, AI & Automation ──────────────────────────────────────────────
    "data analyst",
    "data scientist",
    "automation developer",
    "chatbot developer",
    "machine learning",
    "web scraping",
    // ── Finance & Accounting ───────────────────────────────────────────────
    "bookkeeper",
    "accountant",
    "tax consultant",
    // ── Translation & Language ─────────────────────────────────────────────
    "translator",
    "transcriptionist",
    "subtitles",
    // ── Education & Coaching ───────────────────────────────────────────────
    "online tutor",
    "business coach",
    "fitness coach",
    // ── E-commerce ────────────────────────────────────────────────────────
    "Etsy seller",
    "Amazon seller",
    "dropshipping",
    // ── General ────────────────────────────────────────────────────────────
    "freelancer",
    "remote work",
    "freelance job",
  ].join(",")
)
  .split(",")
  .map((q) => q.trim())
  .filter(Boolean);

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

// ── Source 3: Threads.net (HTML Scraping — No API) ───────────────────────────

/**
 * Fetch a Threads page with retries.
 */
async function threadsFetch(url, label) {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": THREADS_UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-Dest": "document",
        },
        redirect: "follow",
      });

      if (resp.status === 429 || resp.status === 503) {
        const wait = Math.pow(2, attempt + 1) * 1000 + Math.random() * 500;
        console.warn(
          `  [threads] ${resp.status} on ${label}, retry ${attempt + 1} in ${(wait / 1000).toFixed(1)}s`,
        );
        await delay(wait);
        continue;
      }

      if (!resp.ok) {
        return { html: null, error: `${resp.status} ${resp.statusText}` };
      }

      const html = await resp.text();
      return { html, error: null };
    } catch (err) {
      if (attempt < 2) {
        await delay(1000 * (attempt + 1));
        continue;
      }
      return { html: null, error: err.message };
    }
  }
  return { html: null, error: "Max retries exceeded" };
}

/**
 * Extract og:content meta tag value from HTML.
 */
function threadsMeta(html, prop) {
  const rx = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(rx);
  if (m) return m[1];
  // Try reversed attr order: content before property
  const rx2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m2 = html.match(rx2);
  return m2 ? m2[1] : null;
}

/**
 * Extract post links from a Threads listing page (tag or search results).
 * Returns array of { user, code, url }.
 */
function extractThreadsPostLinks(html) {
  const posts = [];
  const seen = new Set();

  // Pattern: /@username/post/POSTCODE in href attributes or JSON
  const linkRx = /\/@([a-zA-Z0-9_.]+)\/post\/([a-zA-Z0-9_-]+)/g;
  let m;
  while ((m = linkRx.exec(html)) !== null) {
    const key = `${m[1]}/${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    posts.push({
      user: m[1],
      code: m[2],
      url: `${THREADS_BASE}/@${m[1]}/post/${m[2]}`,
    });
  }

  return posts;
}

/**
 * Extract a `taken_at` Unix timestamp from Threads embedded JSON near a post code.
 * Threads JSON often contains `"taken_at":1234567890` near the post's `"code":"..."`.
 */
function extractTakenAt(scriptText, code) {
  // Find the chunk of JSON surrounding this code (up to 2000 chars around it)
  const idx = scriptText.indexOf(`"code":"${code}"`);
  if (idx < 0) return null;
  const start = Math.max(0, idx - 1500);
  const end = Math.min(scriptText.length, idx + 1500);
  const chunk = scriptText.slice(start, end);

  // Look for taken_at (Unix epoch seconds)
  const m = chunk.match(/"taken_at"\s*:\s*(\d{10,})/);
  if (m) {
    const ts = parseInt(m[1], 10);
    // Sanity: must be between 2020 and 2030
    if (ts > 1577836800 && ts < 1893456000) return ts;
  }

  // Fallback: look for device_timestamp (sometimes milliseconds)
  const m2 = chunk.match(/"device_timestamp"\s*:\s*(\d{10,})/);
  if (m2) {
    let ts = parseInt(m2[1], 10);
    if (ts > 1e12) ts = Math.floor(ts / 1000); // ms → s
    if (ts > 1577836800 && ts < 1893456000) return ts;
  }

  return null;
}

/**
 * Try to extract post text from embedded JSON in Threads HTML.
 * Threads embeds React hydration data in script tags.
 */
function extractThreadsEmbeddedPosts(html) {
  const posts = [];

  // Look for "text":"..." patterns in script tags (Threads embeds post data)
  // This captures the post text from React hydration JSON
  const scriptBlocks = [
    ...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const block of scriptBlocks) {
    const script = block[1];
    if (!script.includes('"text"')) continue;

    // Extract text + code + taken_at triples from the JSON
    const textMatches = [
      ...script.matchAll(
        /"code"\s*:\s*"([^"]+)"[\s\S]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
      ),
    ];
    for (const tm of textMatches) {
      const code = tm[1];
      const text = tm[2]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim();
      if (text.length > 15) {
        // Try to find a taken_at timestamp near this code in the JSON
        const takenAt = extractTakenAt(script, code);
        posts.push({ code, text, taken_at: takenAt });
      }
    }

    // Also try reversed order (text before code)
    const textMatches2 = [
      ...script.matchAll(
        /"text"\s*:\s*"((?:[^"\\]|\\.)*)[\s\S]*?"code"\s*:\s*"([^"]+)"/g,
      ),
    ];
    for (const tm of textMatches2) {
      const text = tm[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim();
      const code = tm[2];
      if (text.length > 15 && !posts.some((p) => p.code === code)) {
        const takenAt = extractTakenAt(script, code);
        posts.push({ code, text, taken_at: takenAt });
      }
    }
  }
  return posts;
}

/**
 * Parse an individual Threads post page via meta tags.
 */
function parseThreadsPostPage(html, postUrl, source) {
  const ogDesc =
    threadsMeta(html, "og:description") ||
    threadsMeta(html, "twitter:description") ||
    "";

  // Extract username from URL
  const userMatch = postUrl.match(/\/@([^/]+)/);
  const author = userMatch ? userMatch[1] : "unknown";

  // Extract post code
  const codeMatch = postUrl.match(/\/post\/([a-zA-Z0-9_-]+)/);
  const postCode = codeMatch ? codeMatch[1] : postUrl;

  // Timestamp: look for <time datetime="...">
  const timeMatch = html.match(/<time[^>]*datetime="([^"]+)"/i);
  let createdUtc = Math.floor(Date.now() / 1000);
  if (timeMatch) {
    const d = new Date(timeMatch[1]);
    if (!isNaN(d.getTime())) createdUtc = Math.floor(d.getTime() / 1000);
  }

  // Clean description — Threads og:description often starts with meta info
  const text = ogDesc
    .replace(/^\d+\s*(likes?|replies|reposts?),?\s*/gi, "")
    .replace(/^@\w+\s*:\s*/i, "")
    .trim();

  if (!text || text.length < 10) return null;

  return {
    id: `threads_${postCode}`,
    name: `threads_${postCode}`,
    title: text.slice(0, 300),
    selftext: text.slice(0, 2000),
    author,
    author_name: `@${author}`,
    permalink: `https://www.threads.net/@${author}/post/${postCode}`,
    subreddit: null,
    created_utc: createdUtc,
    num_comments: 0,
    ups: 0,
    link_flair_text: "Threads",
    compensation: null,
    employment_type: null,
    location: null,
    _sub: "threads",
    source: `threads-${source}`,
  };
}

/**
 * Fetch a Threads tag or search page, discover post links, fetch detail pages.
 * Two-phase approach (like Craigslist): listing page → detail pages.
 */
async function fetchThreadsListingPage(url, source, label) {
  const { html, error } = await threadsFetch(url, label);
  if (!html) return { posts: [], error };

  const results = [];

  // Phase 1 (embedded JSON) gives fast text but NO reliable timestamps —
  // posts get faked as "today" making 2025 posts look fresh. Skip it.
  // Phase 2 (detail pages) fetches each post page and extracts the real
  // <time datetime> tag, letting the age filter work correctly.

  // Phase 2: Extract post links from HTML and fetch detail pages
  const postLinks = extractThreadsPostLinks(html);
  if (postLinks.length === 0) {
    // Fallback: try to extract something from the page's own meta tags
    const pageMeta = parseThreadsPostPage(html, url, source);
    if (pageMeta) {
      const age = Math.floor(Date.now() / 1000) - (pageMeta.created_utc || 0);
      if (age <= THREADS_MAX_AGE_S) return { posts: [pageMeta], error: null };
      console.log(`    → 1 post found but older than ${THREADS_MAX_AGE_DAYS}d — skipped`);
      return { posts: [], error: null };
    }
    return { posts: [], error: "No post links found" };
  }

  const toFetch = postLinks.slice(0, THREADS_DETAIL_LIMIT);
  console.log(
    `    → ${postLinks.length} post links found, fetching ${toFetch.length} detail pages`,
  );

  // Fetch detail pages with controlled concurrency
  for (let i = 0; i < toFetch.length; i += THREADS_CONCURRENCY) {
    const batch = toFetch.slice(i, i + THREADS_CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (link) => {
        const { html: postHtml } = await threadsFetch(
          link.url,
          `@${link.user}/${link.code}`,
        );
        if (!postHtml) return null;
        return parseThreadsPostPage(postHtml, link.url, source);
      }),
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) {
        // Skip posts older than THREADS_MAX_AGE_DAYS
        const age = Math.floor(Date.now() / 1000) - (r.value.created_utc || 0);
        if (age > THREADS_MAX_AGE_S) continue;
        results.push(r.value);
      }
    }

    if (i + THREADS_CONCURRENCY < toFetch.length) await delay(500);
  }

  return { posts: results, error: null };
}

/**
 * Fetch all Threads data: hashtag pages + search pages.
 */
async function fetchAllThreads(deadline) {
  const allPosts = [];
  const diagnostics = [];
  let successCount = 0;

  // ── Hashtag pages ──
  for (const tag of THREADS_TAGS) {
    if (deadline && Date.now() >= deadline) {
      console.log(`  [threads] ⏱ Deadline reached — skipping remaining tags`);
      break;
    }
    const url = `${THREADS_BASE}/search?q=%23${encodeURIComponent(tag)}&serp_type=default`;
    console.log(`  [threads] Tag: #${tag}`);

    const result = await fetchThreadsListingPage(url, `tag-${tag}`, `#${tag}`);
    allPosts.push(...result.posts);
    if (result.posts.length > 0) successCount++;

    diagnostics.push({
      type: "tag",
      query: tag,
      count: result.posts.length,
      error: result.error,
    });

    await delay(1200);
  }

  // ── Search queries ──
  for (const query of THREADS_SEARCHES) {
    if (deadline && Date.now() >= deadline) {
      console.log(
        `  [threads] ⏱ Deadline reached — skipping remaining searches`,
      );
      break;
    }
    const url = `${THREADS_BASE}/search?q=${encodeURIComponent(query)}&serp_type=default`;
    console.log(`  [threads] Search: "${query}"`);

    const result = await fetchThreadsListingPage(
      url,
      `search-${query.replace(/\s+/g, "-").toLowerCase()}`,
      query,
    );
    allPosts.push(...result.posts);
    if (result.posts.length > 0) successCount++;

    diagnostics.push({
      type: "search",
      query,
      count: result.posts.length,
      error: result.error,
    });

    await delay(1200);
  }

  // Deduplicate
  const deduped = [];
  const seenIds = new Set();
  for (const p of allPosts) {
    if (!seenIds.has(p.id)) {
      seenIds.add(p.id);
      deduped.push(p);
    }
  }

  console.log(
    `  [threads] Summary: ${successCount}/${THREADS_TAGS.length + THREADS_SEARCHES.length} pages returned data, ${deduped.length} unique posts`,
  );

  return {
    posts: deduped.slice(0, THREADS_MAX_POSTS),
    diagnostics,
  };
}

// ── Source 4: Remotive.com (free public API — reliable from any IP) ──────────

// Freelance/remote job categories to fetch from Remotive
const REMOTIVE_CATEGORIES = (
  process.env.REMOTIVE_CATEGORIES ||
  "software-dev,design,marketing,writing,customer-support,data,devops-sysadmin,product,finance"
)
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

const REMOTIVE_MAX_PER_CAT = parseInt(
  process.env.REMOTIVE_MAX_PER_CAT || "20",
  10,
);

const REMOTIVE_CATEGORY_LABELS = {
  "software-dev": "Development",
  design: "Design",
  marketing: "Marketing",
  writing: "Writing",
  "customer-support": "Support",
  data: "Data",
  "devops-sysadmin": "DevOps",
  product: "Product",
  finance: "Finance",
  legal: "Legal",
  "human-resources": "HR",
  "all-others": "Other",
};

async function fetchRemotive() {
  const allPosts = [];
  const diagnostics = [];

  for (const cat of REMOTIVE_CATEGORIES) {
    const url = `https://remotive.com/api/remote-jobs?category=${encodeURIComponent(cat)}&limit=${REMOTIVE_MAX_PER_CAT}`;
    console.log(`  [remotive] Category: ${cat}`);

    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        console.warn(`  [remotive] ${resp.status} for ${cat}`);
        diagnostics.push({ category: cat, count: 0, error: `${resp.status}` });
        continue;
      }

      const data = await resp.json();
      const jobs = data.jobs || [];

      for (const job of jobs) {
        // Strip HTML from description
        const body = (job.description || "")
          .replace(/<[^>]*>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);

        const title = `${job.company_name}: ${job.title}`;
        const createdUtc = job.publication_date
          ? Math.floor(new Date(job.publication_date).getTime() / 1000)
          : Math.floor(Date.now() / 1000);

        allPosts.push({
          id: `remotive_${job.id}`,
          name: `remotive_${job.id}`,
          title,
          selftext: body,
          author: job.company_name || "unknown",
          author_name: job.company_name || "unknown",
          permalink:
            job.url || `https://remotive.com/remote-jobs/${cat}/${job.id}`,
          subreddit: null,
          created_utc: createdUtc,
          num_comments: 0,
          ups: 0,
          link_flair_text: REMOTIVE_CATEGORY_LABELS[cat] || cat,
          compensation: job.salary || null,
          employment_type: job.job_type || null,
          location: job.candidate_required_location || "Remote",
          _sub: "remotive",
          source: `remotive-${cat}`,
        });
      }

      diagnostics.push({ category: cat, count: jobs.length, error: null });
      console.log(`    → ${jobs.length} jobs from remotive/${cat}`);
    } catch (err) {
      console.warn(`  [remotive] Failed for ${cat}: ${err.message}`);
      diagnostics.push({ category: cat, count: 0, error: err.message });
    }

    await delay(300);
  }

  console.log(
    `  [remotive] Summary: ${allPosts.length} jobs across ${REMOTIVE_CATEGORIES.length} categories`,
  );
  return { posts: allPosts, diagnostics };
}

// ── Fetch All & Deduplicate ──────────────────────────────────────────────────

async function fetchAllPosts() {
  const diagnostics = { craigslist: [], nitter: [], threads: [], remotive: [] };

  // ── Remotive (always runs first — guaranteed to work from any IP) ──
  console.log("\n[fetcher] === Remotive.com Remote Jobs ===");
  const remotive = await fetchRemotive();
  diagnostics.remotive = remotive.diagnostics;
  console.log(`[fetcher] Remotive: ${remotive.posts.length} fetched`);

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

  // Deduplicate across all sources
  const seen = new Set();
  const allPosts = [];
  for (const p of [...remotive.posts, ...cl.posts, ...nitter.posts]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      allPosts.push(p);
    }
  }

  // ── Threads (budget remaining time — abort before GitHub Actions kills us) ──
  const threadsDeadline = SCRIPT_START + SCRIPT_DEADLINE_MS - 90_000; // leave 90s for classify + Redis
  const threadsTimeLeft = Math.max(0, threadsDeadline - Date.now());
  if (threadsTimeLeft < 10_000) {
    console.log(
      `\n[fetcher] === Threads.net === SKIPPED (only ${(threadsTimeLeft / 1000).toFixed(0)}s left)`,
    );
    diagnostics.threads = [
      { type: "skip", error: "Deadline — not enough time" },
    ];
  } else {
    console.log(
      `\n[fetcher] === Threads.net === (${(threadsTimeLeft / 1000).toFixed(0)}s budget)`,
    );
    const threads = await fetchAllThreads(threadsDeadline);
    diagnostics.threads = threads.diagnostics;
    console.log(`[fetcher] Threads: ${threads.posts.length} fetched`);
    for (const p of threads.posts) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        allPosts.push(p);
      }
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
  console.log(
    `[fetcher] Threads tags: ${THREADS_TAGS.length}, searches: ${THREADS_SEARCHES.length}`,
  );

  const start = Date.now();
  const { allPosts, diagnostics } = await fetchAllPosts();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `\n[fetcher] Total: ${allPosts.length} unique posts in ${elapsed}s`,
  );

  if (allPosts.length === 0) {
    console.warn("[fetcher] 0 posts fetched from all sources");
    // Refresh TTL on existing Redis data so it doesn't expire between runs
    try {
      const existingRaw = await redisGet(REDIS_KEY);
      if (existingRaw) {
        await redisSet(REDIS_KEY, existingRaw, REDIS_TTL);
        console.warn(
          "[fetcher] Refreshed TTL on existing Redis data — sources may be blocked/unavailable",
        );
      } else {
        console.warn(
          "[fetcher] No existing Redis data to refresh — users will see empty feed",
        );
      }
    } catch {
      /* best effort */
    }
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
  // Also purge stale Threads posts from previous runs
  const mergedMap = new Map();
  const nowS = Math.floor(Date.now() / 1000);
  let purgedOld = 0;
  for (const g of [...freshGigs, ...existingGigs]) {
    if (mergedMap.has(g.id)) continue;
    // Purge old Threads posts that slipped in before the age filter existed
    if (
      g._sub === "threads" &&
      nowS - (g.created_utc || 0) > THREADS_MAX_AGE_S
    ) {
      purgedOld++;
      continue;
    }
    mergedMap.set(g.id, g);
  }
  if (purgedOld > 0)
    console.log(
      `[fetcher] Purged ${purgedOld} stale Threads posts (older than ${THREADS_MAX_AGE_DAYS}d)`,
    );
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
