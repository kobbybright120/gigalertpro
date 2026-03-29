// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Discord feed
// Returns recent Discord messages stored by the bot in Upstash Redis (list)
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_KEY = "gigalertpro:discord:latest";

async function redisLRange(key, start = "0", stop = "99") {
  let url = (process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/^["']+|["']+$/g, "");
  let token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim().replace(/^["']+|["']+$/g, "");
  if (!url || !token) return null;
  url = url.replace(/\/+$/, "");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["LRANGE", key, start, stop]),
  });

  if (!resp.ok) return null;
  const json = await resp.json();
  return json.result || [];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const list = await redisLRange(REDIS_KEY, "0", "99");
    if (!list) {
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-if-error=3600");
      return res.status(200).json({ posts: [], post_count: 0, source: "discord", cached_at: null });
    }

    const posts = list.map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return { raw: item };
      }
    });

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400");
    return res.status(200).json({ posts, post_count: posts.length, source: "discord", cached_at: new Date().toISOString() });
  } catch (err) {
    console.error("[discord-feed] Fatal:", err);
    res.setHeader("Cache-Control", "public, stale-if-error=86400");
    return res.status(502).json({ error: err.message || "Failed to read discord feed", posts: [] });
  }
}
