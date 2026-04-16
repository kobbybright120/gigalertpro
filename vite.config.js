import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Vite plugin: serves /api/x-feed and /api/scan-reddit locally
 * by reading cached data from Upstash Redis (same as Vercel functions).
 */
function upstashApiPlugin() {
  let upstashUrl, upstashToken;

  async function readUpstashKey(key) {
    const url = `${upstashUrl}/get/${key}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${upstashToken}` },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.result || null;
  }

  return {
    name: "upstash-api-middleware",
    configureServer(server) {
      // Load .env so we can read Upstash creds
      const env = loadEnv("development", process.cwd(), "");
      upstashUrl = (env.UPSTASH_REDIS_REST_URL || "").replace(/["']/g, "");
      upstashToken = (env.UPSTASH_REDIS_REST_TOKEN || "").replace(/["']/g, "");

      server.middlewares.use(async (req, res, next) => {
        const simpleKeyMap = {
          "/api/scan-reddit": "gigalertpro:latest",
        };

        // Simple single-key endpoints
        const simpleKey = simpleKeyMap[req.url];
        if (simpleKey) {
          if (!upstashUrl || !upstashToken) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Upstash env vars not set" }));
            return;
          }
          try {
            const raw = await readUpstashKey(simpleKey);
            if (!raw) {
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({ posts: [], post_count: 0, feed: "empty" }),
              );
              return;
            }
            res.setHeader("Content-Type", "application/json");
            res.end(raw);
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Multi-platform merge endpoint (mirrors production x-feed.js)
        if (req.url === "/api/x-feed") {
          if (!upstashUrl || !upstashToken) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Upstash env vars not set" }));
            return;
          }
          try {
            const [xRaw, threadsRaw] = await Promise.all([
              readUpstashKey("gigalertpro:x:latest"),
              readUpstashKey("gigalertpro:threads:latest"),
            ]);

            const xData = xRaw ? JSON.parse(xRaw) : { posts: [] };
            const threadsData = threadsRaw
              ? JSON.parse(threadsRaw)
              : { posts: [] };

            // Normalize crawler posts (Threads format)
            function normalizeCrawlerPosts(
              data,
              platform,
              subKey,
              sourceDefault,
            ) {
              return (data.posts || []).map((p) => ({
                id: p.id || `${subKey}_${Date.now()}`,
                name: p.id || `${subKey}_${Date.now()}`,
                title: p.title || "",
                selftext: p.body_preview || p.selftext || p.title || "",
                author: (p.author || "unknown").replace(/^@/, ""),
                author_name: p.author || platform,
                permalink: p.url || p.permalink || "",
                subreddit: null,
                created_utc: p.posted_at
                  ? Math.floor(new Date(p.posted_at).getTime() / 1000)
                  : p.created_utc || Math.floor(Date.now() / 1000),
                num_comments: 0,
                ups: 0,
                link_flair_text: platform,
                _sub: p._sub || subKey,
                source: p.source || sourceDefault,
              }));
            }

            const threadsPosts = normalizeCrawlerPosts(
              threadsData,
              "Threads",
              "threads",
              "threads-playwright",
            );

            const seen = new Set();
            const merged = [];
            for (const p of [...(xData.posts || []), ...threadsPosts]) {
              if (!seen.has(p.id)) {
                seen.add(p.id);
                merged.push(p);
              }
            }

            // Drop posts older than 30 days
            const MAX_AGE_SEC = 30 * 86400;
            const nowSec = Math.floor(Date.now() / 1000);
            const fresh = merged.filter(
              (p) => !p.created_utc || nowSec - p.created_utc < MAX_AGE_SEC,
            );
            fresh.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                posts: fresh,
                cached_at: xData.cached_at || new Date().toISOString(),
                post_count: fresh.length,
                feed: "multi-platform",
              }),
            );
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), upstashApiPlugin()],
  envPrefix: ["VITE_", "TURNSTILE_SITE_KEY", "NEXT_PUBLIC_DODO_LINK_"],
  server: {
    proxy: {
      "/reddit-api": {
        target: "https://www.reddit.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/reddit-api/, ""),
      },
    },
  },
});
