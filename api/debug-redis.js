// ─────────────────────────────────────────────────────────────────────────────
// Debug endpoint — shows what's stored in each Redis key
// Protected by ADMIN_TOKEN env var. Remove or restrict in production.
// Usage: GET /api/debug-redis?token=YOUR_ADMIN_TOKEN
// ─────────────────────────────────────────────────────────────────────────────

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
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.result || null;
  } catch {
    return null;
  }
}

async function redisTTL(key) {
  const { url, token } = getRedisCredentials();
  if (!url || !token) return -1;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["TTL", key]),
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) return -1;
    const json = await resp.json();
    return json.result ?? -1;
  } catch {
    return -1;
  }
}

async function inspectKey(key) {
  const [raw, ttl] = await Promise.all([redisGet(key), redisTTL(key)]);
  if (!raw) return { key, exists: false, ttl_seconds: ttl };
  try {
    const d = JSON.parse(raw);
    const posts = d.posts || [];
    const bySource = {};
    for (const p of posts) {
      const src = p._sub || "unknown";
      bySource[src] = (bySource[src] || 0) + 1;
    }
    return {
      key,
      exists: true,
      ttl_seconds: ttl,
      post_count: posts.length,
      cached_at: d.cached_at,
      feed: d.feed,
      by_source: bySource,
      sample_titles: posts.slice(0, 3).map((p) => ({
        source: p._sub,
        title: (p.title || "").slice(0, 80),
      })),
    };
  } catch {
    return {
      key,
      exists: true,
      ttl_seconds: ttl,
      raw_length: raw.length,
      parse_error: true,
    };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Simple token guard
  const adminToken = process.env.ADMIN_TOKEN || "gigalert-debug";
  const { token } = req.query;
  if (token !== adminToken) {
    return res
      .status(401)
      .json({ error: "Unauthorized — pass ?token=YOUR_ADMIN_TOKEN" });
  }

  const keys = [
    "gigalertpro:latest", // Reddit
    "gigalertpro:x:latest", // X + CL + Threads (fetch-x.js)
    "gigalertpro:threads:latest", // Playwright crawler
    "gigalertpro:seen:x", // Dedup set
  ];

  const results = await Promise.all(keys.map(inspectKey));

  return res.status(200).json({
    checked_at: new Date().toISOString(),
    redis_configured: !!(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ),
    keys: results,
  });
}
