// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Read-only gig data endpoint
//
// PRODUCTION (recommended):
//   Reads pre-fetched JSON from Upstash Redis (written by GitHub Action cron).
//   → Zero Reddit calls per user request, instant KV read, CDN-cached at edge.
//   → Supports thousands/millions of users with no stampedes.
//
// FALLBACK (no Redis configured):
//   Falls back to live RSS fetch (original behavior) for dev / initial setup.
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_KEY = "gigalertpro:latest";

// ── Upstash Redis REST read (zero dependencies) ─────────────────────────────

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

// ── RSS Fallback (kept for dev mode / when Redis not configured) ─────────────

const COMBINED_SUBS = [
  "hiring",
  "jobbit",
  "remotejs",
  "freelance_forhire",
  "gameDevClassifieds",
  "DesignJobs",
  "Jobs4Bitcoins",
  "WorkOnline",
];
const SEARCH_SUBS = [
  { name: "forhire", search: "flair:Hiring" },
  { name: "slavelabour", search: "flair:Task" },
];
const USER_AGENT =
  "Mozilla/5.0 (compatible; GigAlertPro/1.0; +https://gigalertpro.vercel.app)";

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
    .replace(/&#x200B;/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlText(xml, tag) {
  const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(rx);
  return m ? m[1].trim() : "";
}

function xmlAttr(xml, tag, attr) {
  const rx = new RegExp(`<${tag}[^>]*?${attr}="([^"]*)"`, "i");
  const m = xml.match(rx);
  return m ? m[1] : "";
}

function parseAtomFeed(xml, defaultSub) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const title = stripHtml(xmlText(entry, "title"));
    const link = xmlAttr(entry, "link", "href");
    const body = stripHtml(xmlText(entry, "content"));
    const author = xmlText(entry, "name").replace(/^\/u\//, "");
    const updated = xmlText(entry, "updated");
    const category = xmlAttr(entry, "category", "term") || defaultSub;
    const id = xmlText(entry, "id");
    const postIdMatch = id.match(/t3_(\w+)/);
    const postId = postIdMatch ? postIdMatch[1] : id;
    const createdUtc = updated
      ? Math.floor(new Date(updated).getTime() / 1000)
      : 0;
    const permalink = link ? link.replace("https://www.reddit.com", "") : "";
    entries.push({
      id: postId,
      name: `t3_${postId}`,
      title,
      selftext: body.slice(0, 2000),
      author,
      permalink,
      subreddit: category,
      created_utc: createdUtc,
      num_comments: 0,
      ups: 0,
      link_flair_text: null,
      _sub: category,
    });
  }
  return entries;
}

async function fetchRSS(url, label) {
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
        redirect: "follow",
      });
      if (resp.status === 429) {
        await delay(Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000);
        continue;
      }
      if (!resp.ok)
        return { xml: null, status: resp.status, error: resp.statusText };
      return { xml: await resp.text(), status: resp.status, error: null };
    } catch (err) {
      if (attempt === MAX_RETRIES)
        return { xml: null, status: 0, error: err.message };
      await delay(1000 * (attempt + 1));
    }
  }
  return { xml: null, status: 0, error: "Max retries exceeded" };
}

async function fetchAllPostsLive() {
  const diagnostics = [];
  const allPosts = [];

  const combinedUrl = `https://www.reddit.com/r/${COMBINED_SUBS.join("+")}/new/.rss?limit=100`;
  const combined = await fetchRSS(combinedUrl, "combined");
  if (combined.xml) {
    const posts = parseAtomFeed(combined.xml, "combined");
    allPosts.push(...posts);
    diagnostics.push({
      source: `r/${COMBINED_SUBS.join("+")}`,
      status: combined.status,
      count: posts.length,
      error: null,
    });
  } else {
    diagnostics.push({
      source: `r/${COMBINED_SUBS.join("+")}`,
      status: combined.status,
      count: 0,
      error: combined.error,
    });
  }
  await delay(500);

  for (const sub of SEARCH_SUBS) {
    const searchUrl = `https://www.reddit.com/r/${sub.name}/search.rss?q=${encodeURIComponent(sub.search)}&restrict_sr=1&sort=new&limit=30`;
    const result = await fetchRSS(searchUrl, `r/${sub.name}/search`);
    if (result.xml) {
      const posts = parseAtomFeed(result.xml, sub.name);
      allPosts.push(...posts);
      diagnostics.push({
        source: `r/${sub.name}/search?q=${sub.search}`,
        status: result.status,
        count: posts.length,
        error: null,
      });
    } else {
      diagnostics.push({
        source: `r/${sub.name}/search?q=${sub.search}`,
        status: result.status,
        count: 0,
        error: result.error,
      });
    }
    await delay(500);
  }

  return {
    posts: allPosts,
    cached_at: new Date().toISOString(),
    post_count: allPosts.length,
    feed: "rss-live",
    diagnostics,
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ── 1) Try Upstash Redis first (production path — instant KV read) ──
    const cached = await redisGet(REDIS_KEY);
    if (cached) {
      console.log("[scan-reddit] Serving from Upstash Redis cache");
      // Aggressive CDN caching — data is pre-fetched by cron, safe to cache long
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=120, stale-if-error=86400",
      );
      res.setHeader("Content-Type", "application/json");
      // cached is already a JSON string — send directly (no double-serialize)
      return res.status(200).end(cached);
    }

    // ── 2) Fallback: live RSS fetch (dev / Redis not configured) ──
    console.log("[scan-reddit] Redis miss — falling back to live RSS fetch");
    const data = await fetchAllPostsLive();

    // Shorter CDN TTL for live path
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=600, stale-if-error=3600",
    );
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(data);
  } catch (err) {
    console.error("[scan-reddit] Fatal error:", err);
    res.setHeader("Cache-Control", "public, stale-if-error=86400");
    return res.status(502).json({
      error: err.message || "Failed to fetch gig data",
      posts: [],
    });
  }
}
