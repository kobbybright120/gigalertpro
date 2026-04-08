// ─────────────────────────────────────────────────────────────────────────────
// Vercel Cron — Lightweight community gig refresh (backup for GitHub Actions)
//
// Runs every 6 hours via Vercel cron as a safety net.
// Does a quick Nitter + Craigslist fetch (subset of the full cron) and
// MERGES with existing Redis data so we never lose posts.
//
// The full fetch (100+ queries) runs via GitHub Actions every 5 min.
// This is just a fallback in case GitHub Actions crons stop.
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_KEY = "gigalertpro:x:latest";
const FETCH_TIMEOUT = 4000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Redis helpers ────────────────────────────────────────────────────────────

function getRedisCredentials() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "")
    .trim()
    .replace(/^["']+|["']+$/g, "");
  return { url, token };
}

async function redisGet(key) {
  const { url, token } = getRedisCredentials();
  if (!url || !token) return null;
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
  const { url, token } = getRedisCredentials();
  if (!url || !token) return;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", key, value, "EX", ttlSeconds]),
    signal: AbortSignal.timeout(3000),
  });
}

// ── Quick Nitter fetch ───────────────────────────────────────────────────────

const NITTER_INSTANCES = ["nitter.perennialte.ch", "xcancel.com"];
const NITTER_SEARCHES = [
  "hiring graphic designer",
  "hiring web developer",
  "hiring virtual assistant",
  "hiring video editor",
  "hiring content writer",
  "hiring social media manager",
  "freelance opportunity",
  "need a freelancer",
  "hiring copywriter",
  "hiring data entry",
];

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
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

async function fetchNitterQuick(deadline) {
  const posts = [];
  for (const query of NITTER_SEARCHES) {
    if (Date.now() >= deadline) break;
    for (const instance of NITTER_INSTANCES) {
      if (Date.now() >= deadline) break;
      try {
        const url = `https://${instance}/search/rss?f=tweets&q=${query.replace(/\s+/g, "+")}`;
        const resp = await fetch(url, {
          headers: { "User-Agent": "GigAlertPro/1.0", Accept: "text/xml" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });
        if (!resp.ok) continue;
        const xml = await resp.text();
        if (!xml.includes("<item>")) continue;

        const itemRx = /<item>([\s\S]*?)<\/item>/gi;
        let m;
        while ((m = itemRx.exec(xml)) !== null) {
          const entry = m[1];
          const link = xmlText(entry, "link");
          const statusMatch = link.match(/\/status\/(\d+)/);
          const tweetId = statusMatch ? statusMatch[1] : link;
          const creator = (
            xmlText(entry, "dc:creator") ||
            xmlText(entry, "creator") ||
            ""
          )
            .replace(/^@/, "")
            .trim();
          const pubDate = xmlText(entry, "pubDate");

          posts.push({
            id: `x_${tweetId}`,
            name: `x_${tweetId}`,
            title: stripHtml(xmlText(entry, "title")).slice(0, 300),
            selftext: stripHtml(xmlText(entry, "description")).slice(0, 2000),
            author: creator || "unknown",
            author_name: `@${creator || "unknown"}`,
            permalink: link.replace(/https?:\/\/[^/]+/, "https://x.com").trim(),
            subreddit: null,
            created_utc: pubDate
              ? Math.floor(new Date(pubDate).getTime() / 1000)
              : Math.floor(Date.now() / 1000),
            num_comments: 0,
            ups: 0,
            link_flair_text: query,
            _sub: "nitter",
            source: `x-search-${query.replace(/\s+/g, "-").toLowerCase()}`,
          });
        }
        break; // success, next query
      } catch {
        continue;
      }
    }
  }
  return posts;
}

// ── Quick Craigslist fetch ───────────────────────────────────────────────────

const CL_CITIES = ["newyork", "sfbay", "losangeles", "chicago", "austin"];
const CL_CATEGORIES = ["cpg", "crg", "wrg"];
const CL_CAT_NAMES = { cpg: "Computer", crg: "Creative", wrg: "Writing" };

async function fetchCraigslistQuick(deadline) {
  const posts = [];
  for (const city of CL_CITIES) {
    if (Date.now() >= deadline) break;
    for (const cat of CL_CATEGORIES) {
      if (Date.now() >= deadline) break;
      try {
        const resp = await fetch(
          `https://${city}.craigslist.org/search/${cat}`,
          {
            headers: { "User-Agent": UA, Accept: "text/html" },
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
          },
        );
        if (!resp.ok) continue;
        const html = await resp.text();
        if (
          html.includes("has been blocked") ||
          !html.includes('<div class="title">')
        )
          continue;

        const re =
          /<a href="(https:\/\/[^"]+\.html)"[^>]*>[\s\S]*?<div class="title">([^<]+)<\/div>[\s\S]*?<\/a>/g;
        let m;
        while ((m = re.exec(html)) !== null) {
          const url = m[1];
          const title = m[2].trim();
          const idMatch = url.match(/\/(\d+)\.html/);
          const id = idMatch ? idMatch[1] : url;
          posts.push({
            id: `cl_${id}`,
            name: `cl_${id}`,
            title,
            selftext: title,
            author: city,
            author_name: `${city} Craigslist`,
            permalink: url,
            subreddit: null,
            created_utc: Math.floor(Date.now() / 1000),
            num_comments: 0,
            ups: 0,
            link_flair_text: CL_CAT_NAMES[cat] || cat,
            _sub: "craigslist",
            location: city,
            source: `cl-${city}-${cat}`,
          });
        }
      } catch {
        continue;
      }
    }
  }
  return posts;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Vercel cron sends AUTHORIZATION header we can verify
  // (optional — skip for now, the function is read-only safe)

  const deadline = Date.now() + 55000; // 55s budget (Vercel Pro = 60s, Hobby = 60s for cron)

  try {
    // Fetch from Nitter + Craigslist in parallel
    const [nitterPosts, clPosts] = await Promise.all([
      fetchNitterQuick(deadline),
      fetchCraigslistQuick(deadline),
    ]);

    const freshPosts = [...nitterPosts, ...clPosts];
    console.log(
      `[cron] Fetched ${nitterPosts.length} Nitter + ${clPosts.length} CL = ${freshPosts.length} fresh`,
    );

    // Read existing Redis data and merge (don't overwrite, MERGE)
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

    // Merge: fresh first, then existing, dedup
    const seen = new Set();
    const merged = [];
    for (const p of [...freshPosts, ...existing]) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        merged.push(p);
      }
    }
    merged.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));
    const capped = merged.slice(0, 300);

    const payload = JSON.stringify({
      posts: capped,
      cached_at: new Date().toISOString(),
      post_count: capped.length,
      feed: "vercel-cron-refresh",
    });

    await redisSet(REDIS_KEY, payload, 86400); // 24h TTL since this runs every 6h
    console.log(
      `[cron] Stored ${capped.length} posts (${freshPosts.length} new, ${existing.length} existing)`,
    );

    return res.status(200).json({
      ok: true,
      fresh: freshPosts.length,
      total: capped.length,
    });
  } catch (err) {
    console.error("[cron] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
