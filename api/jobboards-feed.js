// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Job Board feed
//
// Reads pre-fetched job board data from Upstash Redis
// (written by GitHub Action cron via scripts/fetch-jobboards.js).
// Returns normalized JSON array of job board gigs.
// ─────────────────────────────────────────────────────────────────────────────

const HANDLER_DEADLINE_MS = 8000;
const REDIS_KEY = "gigalertpro:jobboards:latest";

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
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.result || null;
  } catch {
    return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const cached = await redisGet(REDIS_KEY);

    if (cached) {
      const data = JSON.parse(cached);
      const posts = data.posts || [];

      // Drop posts older than 30 days
      const MAX_AGE_SECONDS = 30 * 86400;
      const nowSec = Math.floor(Date.now() / 1000);
      const fresh = posts.filter(
        (p) => !p.created_utc || nowSec - p.created_utc < MAX_AGE_SECONDS,
      );

      fresh.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

      console.log(
        `[jobboards-feed] Serving ${fresh.length} job board posts from Redis`,
      );

      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=60",
      );
      res.setHeader("Content-Type", "application/json");
      return res.status(200).json({
        posts: fresh,
        cached_at: data.cached_at || new Date().toISOString(),
        post_count: fresh.length,
        feed: "jobboards",
        sources: data.sources || {},
      });
    }

    // No data in Redis yet
    console.log("[jobboards-feed] No job board data in Redis");
    res.setHeader("Cache-Control", "public, s-maxage=30");
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      posts: [],
      cached_at: new Date().toISOString(),
      post_count: 0,
      feed: "jobboards",
      sources: {},
    });
  } catch (err) {
    console.error("[jobboards-feed] Error:", err);
    return res
      .status(200)
      .json({ error: err.message, posts: [], post_count: 0 });
  }
}
