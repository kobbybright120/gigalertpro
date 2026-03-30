// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — X (Twitter) job feed endpoint
//
// Reads pre-fetched X job posts from Upstash Redis (written by cron fetcher).
// Returns JSON with the same shape as scan-reddit for easy frontend integration.
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_KEY = "gigalertpro:x:latest";

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

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const cached = await redisGet(REDIS_KEY);

    if (cached) {
      // Serve pre-fetched data with aggressive CDN caching
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=120",
      );
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(cached);
    }

    // No cached data available
    res.setHeader("Cache-Control", "public, s-maxage=60");
    return res.status(200).json({
      posts: [],
      cached_at: null,
      post_count: 0,
      feed: "x-empty",
      message:
        "No X feed data cached yet. The fetcher cron may not have run, or all Nitter instances may be down.",
    });
  } catch (err) {
    console.error("[x-feed] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
