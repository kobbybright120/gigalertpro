#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — TikTok Gig Monitor (Proxitok RSS)
//
// Fetches gig/hiring-related TikTok posts from Proxitok RSS hashtag feeds.
// Same architecture as fetch-x.js (Nitter for X/Twitter).
//
// AI FILTER: Uses GPT-4o-mini to classify posts as real gigs vs noise
// before storing. Self-promos, tutorials, and non-hiring content are filtered.
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

const REDIS_KEY = process.env.TT_REDIS_KEY || "gigalertpro:tiktok:latest";
const REDIS_TTL = parseInt(process.env.TT_REDIS_TTL || "7200", 10); // 2 hours
const MAX_POSTS = parseInt(process.env.TT_MAX_POSTS || "300", 10);
const SEEN_KEY = "gigalertpro:seen:tiktok";
const SEEN_TTL = 86400; // 24 hours

// Proxitok instances to try (in priority order — fall through on failure)
const PROXITOK_INSTANCES = (
  process.env.PROXITOK_INSTANCES ||
  "proxitok.pabloferreiro.es,proxitok.privacyredirect.com,tok.habedieeh.re,proxitok.ducks.party,proxitok.kaspoder.com"
)
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

// Hashtags to scan — converted from the 65 X queries + underrepresented niches
const TIKTOK_HASHTAGS = (
  process.env.TIKTOK_HASHTAGS ||
  [
    // ── Design & Creative ──
    "hiringgraphicdesigner",
    "hiringuiuxdesigner",
    "hiringillustrator",
    "hiringvideoeditor",
    "hiringmotiongraphics",
    "hiringanimator",
    "needalogodesigner",
    "lookingforgraphicdesigner",
    "needadesignerfreelance",
    "hiringthumbnaildesigner",
    "hiringbranddesigner",
    // ── Development & Tech ──
    "hiringwebdeveloper",
    "hiringfrontenddeveloper",
    "hiringbackenddeveloper",
    "hiringmobileappdeveloper",
    "hiringsoftwareengineer",
    "hiringmachinelearningengineer",
    "hiringaideveloper",
    "hiringgamedeveloper",
    "hiringblockchaindeveloper",
    "hiringshopifydeveloper",
    "needadeveloper",
    "lookingforprogrammer",
    "hiringreactdeveloper",
    "hiringpythondeveloper",
    "hiringwordpressdeveloper",
    "hiringflutterdeveloper",
    "hiringiosdeveloper",
    "hiringandroiddeveloper",
    "hiringdevopsengineer",
    "needafullstackdeveloper",
    "hiringwebflowdeveloper",
    "hiringnocodedeveloper",
    // ── Writing & Content ──
    "hiringcopywriter",
    "hiringcontentwriter",
    "hiringtechnicalwriter",
    "hiringghostwriter",
    "hiringeditorproofreader",
    "needawriter",
    "lookingforblogger",
    "hiringseowriter",
    "hiringscriptwriter",
    "needacontentcreator",
    // ── Marketing & Sales ──
    "hiringsocialmediamanager",
    "hiringseospecialist",
    "hiringdigitalmarketer",
    "hiringgrowthhacker",
    "hiringemailmarketer",
    "needamarketer",
    "hiringsalesfreelancer",
    "hiringppcspecialist",
    "hiringgoogleadsexpert",
    "hiringfacebookadsfreelancer",
    "hiringcommunitymanager",
    "hiringleadgeneration",
    // ── Business & Admin ──
    "hiringvirtualassistant",
    "hiringdataentry",
    "hiringprojectmanager",
    "hiringcustomersupport",
    "hiringexecutiveassistant",
    "needava",
    "hiringbookkeeper",
    "hiringaccountantfreelance",
    "hiringadminassistantremote",
    // ── Video & Audio ──
    "hiringpodcasteditor",
    "hiringvoiceoverartist",
    "hiringvoiceactor",
    "hiringmusicproducer",
    "hiringaudioengineer",
    "hiringsounddesigner",
    "hiringyoutubeeditor",
    // ── Data & AI ──
    "hiringdataanalystfreelance",
    "hiringdatascientist",
    "needadatascraper",
    "hiringautomationexpert",
    "hiringchatbotdeveloper",
    // ── Specialized Niches ──
    "hiringtranslator",
    "hiringphotographer",
    "hiring3dartist",
    "hiringtranscriptionist",
    "hiringcaddesigner",
    "hiringblenderartist",
    "hiringtutoronline",
    "hiringcoachfreelance",
    // ── General / Remote ──
    "freelancegig",
    "freelanceopportunity",
    "remotefreelancejob",
    "lookingforfreelancer",
    "needafreelancer",
    "hiringfreelancer",
    "remotejobhiring",
    "contractworkhiring",
    "parttimefreelance",
    // ── TikTok-specific + underrepresented niches ──
    "hiringtiktokeditor",
    "hiringugccreator",
    "hiringnocode",
    "needatranslator",
    "hiringtutor",
    "hiringmusicproducerfreelance",
    "hiringaudioengineerfreelance",
    "hiringsounddesignerfreelance",
    "hiringphotoeditor",
    "hiringphotographerfreelance",
    "hiringtranslatorfreelance",
    "hiringtranscriptionistfreelance",
    "hiringtutorfreelance",
    "hiringonlineteacher",
    "hiringshopifystoremanager",
    "hiringamazonlistingexpert",
    "hiringetsy",
    "hiring3dmodeler",
    "hiringcommunitymanagerdiscord",
    "hiringaffiliatemarketer",
    "ugccreator",
    "freelancejobs",
    "hiringcontentcreator",
    "hiringmotiondesigner",
  ].join(",")
)
  .split(",")
  .map((q) => q.trim())
  .filter(Boolean);

const PROXITOK_UA = "GigAlertPro/1.0 (+https://gigalertpro.com)";

// ── Gig-post filter (same as Threads) ────────────────────────────────────────
const REJECT_PATTERNS = [
  /\bi(?:'| a)?m a (?:freelanc|designer|developer|writer|creator|editor|VA|marketer)/i,
  /\bmy (?:freelanc|UGC|design|dev|writing|editing) journey/i,
  /\bjust started (?:my|freelanc|UGC)/i,
  /\bfollow (?:me|us|my page)/i,
  /\bcheck out my (?:portfolio|work|page|website|profile)/i,
  /\bhere(?:'s| is) my (?:portfolio|work|showreel)/i,
  /\bopen for (?:collabs|collaborations|work|commissions)/i,
  /\bavailable for (?:hire|projects|work|bookings)/i,
  /\bI offer (?:services|freelanc)/i,
  /\btips for (?:freelanc|new |beginner)/i,
  /\bhow I (?:got|landed|started|grew|built)/i,
  /\bwho else (?:is|feels|thinks)/i,
  /\bany (?:tips|advice|recommendations)\b/i,
  /\bwhat tools? do you/i,
  /\bfollow for (?:more|daily|weekly)/i,
  /\blet me introduce myself/i,
  /\bintroduction post/i,
  /\brate my (?:portfolio|work|reel|website)/i,
  /\bsharing my (?:journey|experience|story)/i,
  /\bday \d+ of/i,
];

const HIRING_SIGNALS = [
  /\b(?:hiring|looking for(?: a)?|need(?: a)?|seeking|wanted|searching for)\b/i,
  /\b(?:DM (?:me|us|if)|send (?:your |me )?(?:portfolio|samples|resume|CV|rates?))/i,
  /\b(?:apply|submit|deadline|position|role|opening|gig|project|contract|remote (?:job|position|role))\b/i,
  /\$\d/,
  /\b\d+(?:k|K)\b/,
  /\bbudget\b/i,
  /\bper (?:hour|month|project|video|post|article)\b/i,
  /\b(?:paid|compensation|salary|stipend|retainer)\b/i,
  /\b(?:freelancer|contractor|agency) (?:needed|wanted|required)\b/i,
];

function isGigPost(text) {
  if (!text || text.length < 15) return false;
  for (const rx of REJECT_PATTERNS) {
    if (rx.test(text)) return false;
  }
  for (const rx of HIRING_SIGNALS) {
    if (rx.test(text)) return true;
  }
  return false;
}

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

// ── Proxitok RSS fetcher ─────────────────────────────────────────────────────

function parseProxitokRss(xml, hashtag) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const entry = match[1];
    const rawTitle = xmlText(entry, "title");
    const link = xmlText(entry, "link");
    const description = xmlText(entry, "description") || "";
    const pubDate = xmlText(entry, "pubDate");
    const creator =
      xmlText(entry, "dc:creator") || xmlText(entry, "creator") || "";

    // Extract TikTok video ID from link
    const vidMatch = link.match(/\/video\/(\d+)/);
    const videoId = vidMatch
      ? vidMatch[1]
      : link.replace(/[^a-zA-Z0-9]/g, "").slice(-20);
    const author = creator.replace(/^@/, "").trim() || "unknown";
    const body = stripHtml(description);
    const title = stripHtml(rawTitle).slice(0, 300);
    const createdUtc = pubDate
      ? Math.floor(new Date(pubDate).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    // Convert Proxitok URL to TikTok URL
    const tiktokUrl = link
      .replace(/https?:\/\/[^/]+/, "https://www.tiktok.com")
      .trim();

    const fullText = title + " " + body;

    // Apply gig filter
    if (!isGigPost(fullText)) continue;

    items.push({
      id: `tt_${videoId}`,
      name: `tt_${videoId}`,
      title,
      selftext: body.slice(0, 2000),
      author,
      author_name: `@${author}`,
      permalink: tiktokUrl || link,
      subreddit: null,
      created_utc: createdUtc,
      num_comments: 0,
      ups: 0,
      link_flair_text: `#${hashtag}`,
      _sub: "tiktok",
      source: `tt-tag-${hashtag}`,
    });
  }
  return items;
}

async function fetchAllTikTok() {
  const allPosts = [];
  const diagnostics = [];
  let tagsAttempted = 0;
  let tagsSucceeded = 0;

  for (const hashtag of TIKTOK_HASHTAGS) {
    tagsAttempted++;
    let fetched = false;

    for (const instance of PROXITOK_INSTANCES) {
      const url = `https://${instance}/api/rss/tag/${hashtag}`;
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": PROXITOK_UA,
            Accept: "application/rss+xml, text/xml",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(4000),
        });
        if (!resp.ok) continue;
        const xml = await resp.text();
        if (!xml.includes("<item>")) continue;

        const posts = parseProxitokRss(xml, hashtag);
        allPosts.push(...posts);
        diagnostics.push({
          hashtag,
          instance,
          count: posts.length,
          error: null,
        });
        tagsSucceeded++;
        fetched = true;
        break; // success — move to next hashtag
      } catch {
        continue;
      }
    }
    if (!fetched) {
      diagnostics.push({
        hashtag,
        instance: null,
        count: 0,
        error: "All instances failed",
      });
    }

    // Polite delay between requests
    await delay(300 + Math.random() * 300);
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
    `[tiktok] ${tagsSucceeded}/${tagsAttempted} hashtags succeeded, ${unique.length} unique posts`,
  );

  return {
    posts: unique.slice(0, MAX_POSTS),
    diagnostics,
    tagsAttempted,
    tagsSucceeded,
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
  console.log("[tiktok] Starting TikTok gig fetch...");

  // 1. Fetch raw posts
  const {
    posts: rawPosts,
    tagsAttempted,
    tagsSucceeded,
  } = await fetchAllTikTok();
  console.log(`[tiktok] Fetched ${rawPosts.length} raw posts`);

  if (rawPosts.length === 0) {
    console.log("[tiktok] No posts found — skipping Redis write");
    return;
  }

  // 2. Dedup against already-seen set
  const seen = await redisSmembers(SEEN_KEY);
  const newPosts = rawPosts.filter((p) => !seen.has(p.id));
  console.log(
    `[tiktok] ${newPosts.length} new posts (${rawPosts.length - newPosts.length} already classified)`,
  );

  // 3. AI classify new posts
  let classified = newPosts;
  if (
    newPosts.length > 0 &&
    process.env.OPENAI_API_KEY &&
    typeof classifyAndFilter === "function"
  ) {
    try {
      classified = await classifyAndFilter(newPosts, "tiktok");
      console.log(
        `[tiktok] AI filter: ${classified.length}/${newPosts.length} posts kept`,
      );
    } catch (err) {
      console.warn("[tiktok] AI filter failed, using all posts:", err.message);
      classified = newPosts;
    }
  }

  // 4. Mark new IDs as seen
  const newIds = newPosts.map((p) => p.id);
  if (newIds.length > 0) {
    await redisSadd(SEEN_KEY, newIds, SEEN_TTL);
  }

  // 5. Merge with existing Redis data
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
    feed: "tiktok-proxitok",
    tags_attempted: tagsAttempted,
    tags_succeeded: tagsSucceeded,
    new_this_run: classified.length,
  });

  await redisSet(REDIS_KEY, payload, REDIS_TTL);
  console.log(
    `[tiktok] Wrote ${merged.length} posts to Redis (${(payload.length / 1024).toFixed(1)} KB, TTL ${REDIS_TTL}s)`,
  );
}

main().catch((err) => {
  console.error("[tiktok] Fatal:", err);
  process.exit(1);
});
