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
        const keyMap = {
          "/api/x-feed": "gigalertpro:x:latest",
          "/api/scan-reddit": "gigalertpro:latest",
        };

        const redisKey = keyMap[req.url];
        if (!redisKey) return next();

        if (!upstashUrl || !upstashToken) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Upstash env vars not set" }));
          return;
        }

        try {
          const raw = await readUpstashKey(redisKey);
          if (!raw) {
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({ posts: [], post_count: 0, feed: "empty" }),
            );
            return;
          }
          const payload = JSON.parse(raw);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), upstashApiPlugin()],
  envPrefix: ["VITE_", "TURNSTILE_SITE_KEY"],
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
