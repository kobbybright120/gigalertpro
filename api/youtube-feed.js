// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — YouTube gig feed
//
// Reads pre-fetched YouTube gig data from Upstash Redis
// (written by GitHub Action cron running scripts/fetch-youtube.js).
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_KEY = "gigalertpro:youtube:latest";

async function redisGet(key) {
  let url = (process.env.UPSTASH_REDIS_REST_URL || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
  let token = (process.env.UPSTASH_REDIS_REST_TOKEN || "")
    .trim()
    .replace(/^["']+|["']+$/g, "");
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const cached = await redisGet(REDIS_KEY);
    if (cached) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=30, stale-while-revalidate=30",
      );
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(cached);
    }

    return res
      .status(200)
      .json({ posts: [], post_count: 0, feed: "youtube-empty" });
  } catch (err) {
    console.error("[youtube-feed] Error:", err);
    return res
      .status(200)
      .json({ error: err.message, posts: [], post_count: 0 });
  }
}
