// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — RemoteOK dedicated feed
//
// Reads pre-fetched RemoteOK data from Upstash Redis
// (written by GitHub Action: scripts/fetch-remoteok.js)
//
// Strict 24-hour serve-time freshness filter.
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_KEY = "gigalertpro:remoteok:latest";

async function redisGet(key) {
  let url = (process.env.UPSTASH_REDIS_REST_URL || "")
    .trim()
    .replace(/^["']+|["']+$/g, "");
  let token = (process.env.UPSTASH_REDIS_REST_TOKEN || "")
    .trim()
    .replace(/^["']+|["']+$/g, "");
  if (!url || !token) return null;
  try {
    const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.result || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cached = await redisGet(REDIS_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      const posts = data.posts || [];

      // Strict 24-hour serve-time freshness
      const MAX_AGE_SECONDS = 24 * 3600;
      const nowSec = Math.floor(Date.now() / 1000);
      const fresh = posts
        .filter(
          (p) => !p.created_utc || nowSec - p.created_utc < MAX_AGE_SECONDS,
        )
        .sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

      console.log(
        `[remoteok-feed] Serving ${fresh.length} RemoteOK posts from Redis`,
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
        feed: "remoteok",
        sources: { remoteok: fresh.length },
      });
    }

    // No data yet
    res.setHeader("Cache-Control", "public, s-maxage=30");
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      posts: [],
      cached_at: new Date().toISOString(),
      post_count: 0,
      feed: "remoteok",
      sources: { remoteok: 0 },
    });
  } catch (err) {
    console.error("[remoteok-feed] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
