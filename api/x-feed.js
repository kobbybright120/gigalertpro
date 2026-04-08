// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — X (Twitter) + Craigslist + Threads job feed
//
// PRODUCTION (recommended):
//   Reads pre-fetched data from Upstash Redis (written by GitHub Action cron).
//   → Zero external calls per user request, instant KV read.
//
// FALLBACK (no Redis data):
//   Falls back to live Nitter RSS + Threads scrape so the feed is never empty.
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
  "need a designer freelance",
  "hiring thumbnail designer",
  // Development & Tech
  "hiring web developer",
  "hiring software engineer",
  "hiring mobile app developer",
  "hiring game developer",
  "hiring React developer",
  "hiring Python developer",
  "hiring WordPress developer",
  "hiring Shopify developer",
  "need a developer",
  "looking for programmer",
  // Writing & Content
  "hiring copywriter",
  "hiring content writer",
  "hiring ghostwriter",
  "hiring SEO writer",
  "need a content creator",
  // Marketing & Sales
  "hiring social media manager",
  "hiring SEO specialist",
  "hiring digital marketer",
  "hiring PPC specialist",
  "hiring lead generation",
  // Business & Admin
  "hiring virtual assistant",
  "hiring project manager",
  "hiring customer support",
  "hiring data entry",
  "need a VA",
  // Video & Audio
  "hiring podcast editor",
  "hiring voiceover artist",
  "hiring YouTube editor",
  "hiring music producer",
  // Data & AI
  "hiring data analyst freelance",
  "need a data scraper",
  "hiring automation expert",
  // Specialized
  "hiring translator",
  "hiring voice actor",
  "hiring photographer",
  "hiring 3D artist",
  "hiring transcriptionist",
  "hiring tutor online",
  // General
  "freelance gig",
  "freelance opportunity",
  "looking for freelancer",
  "need a freelancer",
  "remote freelance job",
  "hiring freelancer",
  "contract work hiring",
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

// ── Threads fallback (lightweight scrape for serverless) ─────────────────────

const THREADS_FALLBACK_TAGS = [
  "hiring",
  "freelance",
  "remotejobs",
  "hiringnow",
  "freelancework",
];

const THREADS_FALLBACK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function threadsMeta(html, prop) {
  const rx = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(rx);
  if (m) return m[1];
  const rx2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m2 = html.match(rx2);
  return m2 ? m2[1] : null;
}

function extractThreadsPostLinks(html) {
  const posts = [];
  const seen = new Set();
  const linkRx = /\/@([a-zA-Z0-9_.]+)\/post\/([a-zA-Z0-9_-]+)/g;
  let m;
  while ((m = linkRx.exec(html)) !== null) {
    const key = `${m[1]}/${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    posts.push({ user: m[1], code: m[2] });
  }
  return posts;
}

async function fetchThreadsLive() {
  const allPosts = [];

  for (const tag of THREADS_FALLBACK_TAGS) {
    try {
      const url = `https://www.threads.net/search?q=%23${encodeURIComponent(tag)}&serp_type=default`;
      const resp = await fetch(url, {
        headers: {
          "User-Agent": THREADS_FALLBACK_UA,
          Accept: "text/html",
        },
        redirect: "follow",
      });
      if (!resp.ok) continue;
      const html = await resp.text();

      // Try to find post links and fetch first 3
      const links = extractThreadsPostLinks(html).slice(0, 3);
      for (const link of links) {
        try {
          const postUrl = `https://www.threads.net/@${link.user}/post/${link.code}`;
          const postResp = await fetch(postUrl, {
            headers: { "User-Agent": THREADS_FALLBACK_UA, Accept: "text/html" },
            redirect: "follow",
          });
          if (!postResp.ok) continue;
          const postHtml = await postResp.text();
          const desc =
            threadsMeta(postHtml, "og:description") ||
            threadsMeta(postHtml, "twitter:description") ||
            "";
          const text = desc
            .replace(/^\d+\s*(likes?|replies|reposts?),?\s*/gi, "")
            .replace(/^@\w+\s*:\s*/i, "")
            .trim();
          if (text.length < 10) continue;

          allPosts.push({
            id: `threads_${link.code}`,
            name: `threads_${link.code}`,
            title: text.slice(0, 300),
            selftext: text.slice(0, 2000),
            author: link.user,
            author_name: `@${link.user}`,
            permalink: `https://www.threads.net/@${link.user}/post/${link.code}`,
            subreddit: null,
            created_utc: Math.floor(Date.now() / 1000),
            num_comments: 0,
            ups: 0,
            link_flair_text: "Threads",
            _sub: "threads",
            source: `threads-tag-${tag}`,
          });
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  return allPosts;
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

    // ── 2) Fallback: live Nitter RSS + Threads scrape ──
    console.log(
      "[x-feed] Redis miss — falling back to live Nitter + Threads fetch",
    );
    const [nitterData, threadsPosts] = await Promise.all([
      fetchNitterLive(),
      fetchThreadsLive(),
    ]);

    // Merge Nitter + Threads posts
    const mergedPosts = [...nitterData.posts, ...threadsPosts];
    const data = {
      posts: mergedPosts,
      cached_at: new Date().toISOString(),
      post_count: mergedPosts.length,
      feed: "live-fallback",
      diagnostics: nitterData.diagnostics,
    };

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
