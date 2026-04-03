// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — X (Twitter) + Craigslist job feed endpoint
//
// PRODUCTION (recommended):
//   Reads pre-fetched data from Upstash Redis (written by GitHub Action cron).
//   → Zero external calls per user request, instant KV read.
//
// FALLBACK (no Redis data):
//   Falls back to live Nitter RSS fetch so the feed is never empty.
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_KEY = "gigalertpro:x:latest";

// ── Nitter live-fallback config ──────────────────────────────────────────────

const NITTER_INSTANCES = [
  "nitter.perennialte.ch",
  "xcancel.com",
  "nitter.privacyredirect.com",
  "nitter.net",
];

const NITTER_SEARCHES = [
  // Design & Creative
  "hiring graphic designer",
  "hiring video editor",
  "hiring animator",
  "hiring illustrator",
  // Development & Tech
  "hiring web developer",
  "hiring software engineer",
  "hiring mobile app developer",
  "hiring game developer",
  // Writing & Content
  "hiring copywriter",
  "hiring content writer",
  "hiring ghostwriter",
  // Marketing & Sales
  "hiring social media manager",
  "hiring SEO specialist",
  "hiring digital marketer",
  // Business & Admin
  "hiring virtual assistant",
  "hiring project manager",
  "hiring customer support",
  // Specialized
  "hiring translator",
  "hiring voice actor",
  "hiring music producer",
  "hiring photographer",
  // General
  "freelance gig",
  "freelance opportunity",
  "looking for freelancer",
  "need a freelancer",
  "remote freelance job",
];

const NITTER_UA = "GigAlertPro/1.0 (+https://gigalertpro.com)";

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

async function fetchNitterLive() {
  const allPosts = [];
  const diagnostics = [];

  for (const query of NITTER_SEARCHES) {
    let fetched = false;
    for (const instance of NITTER_INSTANCES) {
      const url = `https://${instance}/search/rss?f=tweets&q=${query.replace(/\s+/g, "+")}`;
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": NITTER_UA,
            Accept: "application/rss+xml, text/xml",
          },
          redirect: "follow",
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

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    // ── 1) Try Upstash Redis first (production path) ──
    const cached = await redisGet(REDIS_KEY);

    if (cached) {
      console.log("[x-feed] Serving from Upstash Redis cache");
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=30, stale-while-revalidate=30",
      );
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(cached);
    }

    // ── 2) Fallback: live Nitter RSS fetch ──
    console.log("[x-feed] Redis miss — falling back to live Nitter RSS fetch");
    const data = await fetchNitterLive();

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
    return res.status(500).json({ error: "Internal server error", posts: [] });
  }
}
