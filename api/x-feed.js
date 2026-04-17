// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — X (Twitter) + Craigslist + Threads job feed
//
// PRODUCTION (recommended):
//   Reads pre-fetched data from Upstash Redis (written by GitHub Action cron).
//   → Zero external calls per user request, instant KV read.
//
// FALLBACK (no Redis data):
//   Falls back to a *tiny* live Nitter RSS fetch (a few queries only) so the
//   feed is never fully empty.  Threads scrape is NOT done here — it's too
//   slow for a serverless function. Threads data comes from the cron job only.
// ─────────────────────────────────────────────────────────────────────────────

// Hard deadline for the entire handler (Vercel free = 10 s, Pro = 60 s).
// We aim to finish well within the limit so the user never sees a 504.
const HANDLER_DEADLINE_MS = 8000;

const REDIS_KEY = "gigalertpro:x:latest";
const THREADS_REDIS_KEY = "gigalertpro:threads:latest";
const FACEBOOK_REDIS_KEY = "gigalertpro:facebook:latest";
const LINKEDIN_REDIS_KEY = "gigalertpro:linkedin:latest";

// ── Nitter live-fallback config ──────────────────────────────────────────────
// Keep this list SHORT — each query can take up to 5 s in the worst case.
// The cron job handles the full 65+ search list; this is just a safety net.

const NITTER_INSTANCES = ["nitter.perennialte.ch", "xcancel.com"];

const NITTER_FALLBACK_SEARCHES = [
  "hiring graphic designer",
  "hiring web developer",
  "hiring virtual assistant",
  "hiring video editor",
  "freelance opportunity",
  "need a freelancer",
];

const NITTER_UA = "GigAlertPro/1.0 (+https://gigalertpro.com)";
const FETCH_TIMEOUT_MS = 4000; // per-fetch timeout

// ── Upstash Redis REST ───────────────────────────────────────────────────────

async function redisGet(key) {
  let url = (process.env.UPSTASH_REDIS_REST_URL || "")
    .trim()
    .replace(/^["']+|["']+$/g, "");
  let token = (process.env.UPSTASH_REDIS_REST_TOKEN || "")
    .trim()
    .replace(/^["']+|["']+$/g, "");
  if (!url || !token) return null;

  url = url.replace(/\/+$/, "");

  try {
    const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000), // 3 s max for Redis read
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.result || null;
  } catch {
    return null;
  }
}

async function redisSet(key, value, ttlSeconds) {
  let url = (process.env.UPSTASH_REDIS_REST_URL || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
  let token = (process.env.UPSTASH_REDIS_REST_TOKEN || "")
    .trim()
    .replace(/^["']+|["']+$/g, "");
  if (!url || !token) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", key, value, "EX", ttlSeconds]),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* best effort */
  }
}

// ── Nitter RSS helpers ───────────────────────────────────────────────────────

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

function parseNitterRss(xml, searchQuery) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const entry = match[1];
    const rawTitle = xmlText(entry, "title");
    const link = xmlText(entry, "link");
    const description = xmlText(entry, "description");
    const pubDate = xmlText(entry, "pubDate");
    const creator =
      xmlText(entry, "dc:creator") || xmlText(entry, "creator") || "";

    const statusMatch = link.match(/\/status\/(\d+)/);
    const tweetId = statusMatch ? statusMatch[1] : link;
    const author = creator.replace(/^@/, "").trim() || "unknown";
    const body = stripHtml(description);
    const title = stripHtml(rawTitle).slice(0, 300);
    const createdUtc = pubDate
      ? Math.floor(new Date(pubDate).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
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
      _sub: "nitter",
      source: `x-search-${searchQuery.replace(/\s+/g, "-").toLowerCase()}`,
    });
  }
  return items;
}

async function fetchNitterLive(deadline) {
  const allPosts = [];
  const diagnostics = [];

  for (const query of NITTER_FALLBACK_SEARCHES) {
    // Bail if we're running out of time
    if (Date.now() >= deadline) break;

    let fetched = false;
    for (const instance of NITTER_INSTANCES) {
      if (Date.now() >= deadline) break;
      const url = `https://${instance}/search/rss?f=tweets&q=${query.replace(/\s+/g, "+")}`;
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": NITTER_UA,
            Accept: "application/rss+xml, text/xml",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!resp.ok) continue;
        const xml = await resp.text();
        if (!xml.includes("<item>")) continue;
        if (xml.includes("not yet whitelisted")) continue;

        const posts = parseNitterRss(xml, query);
        allPosts.push(...posts);
        diagnostics.push({ query, instance, count: posts.length, error: null });
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
  }

  // Dedup by tweet ID
  const seen = new Set();
  const unique = [];
  for (const p of allPosts) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      unique.push(p);
    }
  }

  unique.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

  return {
    posts: unique.slice(0, 100),
    cached_at: new Date().toISOString(),
    post_count: unique.length,
    feed: "nitter-live",
    diagnostics,
  };
}

// ── Supabase service-role upsert (bypasses RLS) ─────────────────────────────

async function upsertGigAlerts(rows) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !rows.length)
    return { ok: true, count: 0 };

  const resp = await fetch(`${supabaseUrl}/rest/v1/gig_alerts`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal,resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(8000),
  });

  if (resp.status < 400) return { ok: true, count: rows.length };

  // Batch failed — try each row individually to isolate bad ones
  const bad = [];
  for (const row of rows) {
    const r2 = await fetch(`${supabaseUrl}/rest/v1/gig_alerts`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal,resolution=merge-duplicates",
      },
      body: JSON.stringify([row]),
      signal: AbortSignal.timeout(5000),
    });
    if (r2.status >= 400) bad.push(row.reddit_post_id);
  }
  return { ok: false, count: rows.length - bad.length, bad };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const deadline = Date.now() + HANDLER_DEADLINE_MS;

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  // ── POST: server-side upsert to gig_alerts (bypasses RLS) ──
  if (req.method === "POST") {
    try {
      const rows = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res
          .status(400)
          .json({ error: "Expected non-empty array of rows" });
      }
      // Sanitise each row
      const clean = rows
        .map((r) => ({
          reddit_post_id: String(r.reddit_post_id || ""),
          title: String(r.title || "Untitled"),
          description: String(r.body_preview || r.description || "").slice(
            0,
            500,
          ),
          body_preview: String(r.body_preview || "").slice(0, 500),
          url: String(r.url || ""),
          subreddit: String(r.subreddit || ""),
          budget: r.budget ? String(r.budget) : null,
          author: r.author ? String(r.author) : null,
          reddit_created: r.reddit_created || new Date().toISOString(),
          matched_keywords: Array.isArray(r.matched_keywords)
            ? r.matched_keywords.map(String)
            : [],
          score: Math.round(Number(r.score) || 0),
          comment_count: Math.round(Number(r.comment_count) || 0),
          upvotes: Math.round(Number(r.upvotes) || 0),
          flair: r.flair ? String(r.flair) : null,
          category: r.category ? String(r.category) : null,
          source: r.source ? String(r.source) : "reddit",
        }))
        .filter((r) => r.reddit_post_id);

      const result = await upsertGigAlerts(clean);
      return res.status(result.ok ? 200 : 207).json(result);
    } catch (err) {
      console.error("[x-feed] POST upsert error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ── 1) Try Upstash Redis first (production path) ──
    // Read all platform keys in parallel
    const [cached, threadsCached, facebookCached, linkedinCached] = await Promise.all([
      redisGet(REDIS_KEY),
      redisGet(THREADS_REDIS_KEY),
      redisGet(FACEBOOK_REDIS_KEY),
      redisGet(LINKEDIN_REDIS_KEY),
    ]);

    if (cached || threadsCached || facebookCached || linkedinCached) {
      let mainData = cached ? JSON.parse(cached) : { posts: [] };
      let threadsData = threadsCached
        ? JSON.parse(threadsCached)
        : { posts: [] };
      let facebookData = facebookCached
        ? JSON.parse(facebookCached)
        : { posts: [] };
      let linkedinData = linkedinCached
        ? JSON.parse(linkedinCached)
        : { posts: [] };

      // Normalize Playwright-crawler posts to match expected schema
      function normalizeCrawlerPosts(data, platform, subKey, sourceDefault) {
        return (data.posts || []).map((p) => ({
          id: p.id || `${subKey}_${Date.now()}`,
          name: p.id || `${subKey}_${Date.now()}`,
          title: p.title || "",
          selftext: p.body_preview || p.selftext || p.title || "",
          author: (p.author || "unknown").replace(/^@/, ""),
          author_name: p.author || platform,
          permalink: p.url || p.permalink || "",
          subreddit: null,
          created_utc: p.posted_at
            ? Math.floor(new Date(p.posted_at).getTime() / 1000)
            : p.created_utc || Math.floor(Date.now() / 1000),
          num_comments: 0,
          ups: 0,
          link_flair_text: p.link_flair_text || platform,
          compensation: null,
          employment_type: null,
          location: null,
          _sub: p._sub || subKey,
          source: p.source || sourceDefault,
        }));
      }

      const threadsPosts = normalizeCrawlerPosts(
        threadsData,
        "Threads",
        "threads",
        "threads-playwright",
      );

      const linkedinPosts = normalizeCrawlerPosts(
        linkedinData,
        "LinkedIn",
        "linkedin",
        "linkedin-ddg",
      );

      // Merge + dedup
      const seen = new Set();
      const merged = [];
      for (const p of [...(mainData.posts || []), ...threadsPosts, ...(facebookData.posts || []), ...linkedinPosts]) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          merged.push(p);
        }
      }

      // Drop posts older than 30 days (stale gigs are useless to freelancers)
      const MAX_AGE_SECONDS = 30 * 86400;
      const nowSec = Math.floor(Date.now() / 1000);
      const fresh = merged.filter(
        (p) => !p.created_utc || nowSec - p.created_utc < MAX_AGE_SECONDS,
      );

      fresh.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

      const result = JSON.stringify({
        posts: fresh,
        cached_at:
          mainData.cached_at ||
          threadsData.cached_at ||
          new Date().toISOString(),
        post_count: fresh.length,
        feed: cached ? mainData.feed || "x-cached" : "multi-platform",
      });

      console.log(
        `[x-feed] Serving from Redis: ${(mainData.posts || []).length} main + ${threadsPosts.length} threads + ${linkedinPosts.length} linkedin = ${merged.length} total (${fresh.length} after age filter)`,
      );
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=30, stale-while-revalidate=30",
      );
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    }

    // ── 2) Fallback: lightweight Nitter RSS fetch (no Threads — too slow) ──
    console.log("[x-feed] Redis miss — falling back to lite Nitter fetch");
    const data = await fetchNitterLive(deadline);

    // Auto-populate Redis so subsequent requests are instant
    if (data.posts.length > 0) {
      const payload = JSON.stringify(data);
      redisSet(REDIS_KEY, payload, 3600).catch(() => {}); // fire & forget
    }

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=30, stale-while-revalidate=60",
    );
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(data);
  } catch (err) {
    console.error("[x-feed] Error:", err);
    // Return empty array instead of 500 so the UI doesn't break
    return res
      .status(200)
      .json({ error: err.message, posts: [], post_count: 0 });
  }
}
