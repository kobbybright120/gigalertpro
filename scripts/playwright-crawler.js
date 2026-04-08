import fs from "fs/promises";
import { chromium } from "playwright";

// Maximum age for Threads posts — anything older is stale
const MAX_AGE_DAYS = parseInt(process.env.THREADS_MAX_AGE_DAYS || "30", 10);
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

function getUpstashCredentials() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
  return { url, token };
}

async function redisSet(key, value, ttlSeconds = 3600) {
  const { url, token } = getUpstashCredentials();
  if (!url || !token) {
    console.warn("Upstash credentials not configured; skipping write");
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", key, value, "EX", ttlSeconds]),
    });
  } catch (err) {
    console.error("Failed to write to Upstash:", err.message || err);
  }
}

function encodeId(str) {
  try {
    return Buffer.from(str).toString("base64url");
  } catch {
    return encodeURIComponent(str).slice(0, 64);
  }
}

async function crawlSeeds(seeds) {
  const browser = await chromium.launch({
    headless: process.env.PW_HEADLESS !== "false",
  });
  // Use a realistic browser UA — Threads blocks bot-like agents
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();
  const collected = [];

  for (const seed of seeds) {
    try {
      console.log("Visiting:", seed);
      await page.goto(seed, { waitUntil: "networkidle", timeout: 60000 });
      // Wait for posts to render (Threads loads content via AJAX)
      await page.waitForTimeout(2000 + Math.random() * 1500);

      // Scroll down to trigger lazy-loaded posts
      for (let scroll = 0; scroll < 3; scroll++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(800 + Math.random() * 400);
      }

      const pagePosts = await page.evaluate(() => {
        const out = [];

        // Try <article> elements first (standard Threads DOM)
        let containers = Array.from(document.querySelectorAll("article"));
        // Fallback: Threads may use div-based layout without <article>
        if (containers.length === 0) {
          containers = Array.from(
            document.querySelectorAll(
              'div[role="article"], div[data-pressable-container]',
            ),
          );
        }
        if (containers.length > 0) {
          for (const el of containers.slice(0, 50)) {
            try {
              const timeEl = el.querySelector("time");
              const time = timeEl ? timeEl.getAttribute("datetime") : null;
              const authorEl =
                el.querySelector('a[href*="/@"]') || el.querySelector("a");
              const author = authorEl ? authorEl.innerText.trim() : null;
              // Threads uses div[dir="auto"] for post text; grab all of them
              const textDivs = el.querySelectorAll('div[dir="auto"]');
              let text = "";
              if (textDivs.length > 0) {
                // Pick the longest div[dir="auto"] — the post body
                for (const d of textDivs) {
                  const t = (d.innerText || "").replace(/\s+/g, " ").trim();
                  if (t.length > text.length) text = t;
                }
              } else {
                text = (el.innerText || "").replace(/\s+/g, " ").trim();
              }
              if (text.length < 10) continue; // skip empty/short containers
              const linkEl =
                el.querySelector('a[href*="/post/"]') ||
                el.querySelector('a[href*="/status/"]') ||
                el.querySelector("a");
              const url = linkEl ? linkEl.href : window.location.href;
              out.push({
                title: text.slice(0, 120),
                body_preview: text.slice(0, 400),
                author,
                posted_at: time,
                url,
              });
            } catch (e) {
              /* ignore */
            }
          }
        }

        // Fallback: meta tags (single post page or no articles found)
        if (out.length === 0) {
          const title =
            document.querySelector('meta[property="og:title"]')?.content ||
            document.querySelector('meta[name="twitter:title"]')?.content ||
            document.title ||
            "";
          const description =
            document.querySelector('meta[property="og:description"]')
              ?.content ||
            document.querySelector('meta[name="twitter:description"]')
              ?.content ||
            "";
          const time =
            document.querySelector("time")?.getAttribute("datetime") || null;
          if (description.length >= 10) {
            out.push({
              title: title.slice(0, 120),
              body_preview: description.slice(0, 400),
              author:
                document.querySelector('meta[name="author"]')?.content || null,
              posted_at: time,
              url: window.location.href,
            });
          }
        }

        return out;
      });

      collected.push(...pagePosts);
      console.log(`  → ${pagePosts.length} posts extracted`);
    } catch (err) {
      console.warn("Seed error:", seed, err.message || err);
    }
  }

  await browser.close();
  return collected;
}

async function main() {
  try {
    const raw = await fs.readFile(
      new URL("./threads-seeds.json", import.meta.url),
      "utf-8",
    );
    const seeds = JSON.parse(raw || "[]");
    if (!Array.isArray(seeds) || seeds.length === 0) {
      console.error(
        "No seeds configured. Edit scripts/threads-seeds.json to add Threads URLs to crawl.",
      );
      process.exit(1);
    }

    console.log(`Crawling ${seeds.length} Threads seed URLs...`);
    const posts = await crawlSeeds(seeds);

    // Filter out posts older than MAX_AGE_DAYS
    const now = Date.now();
    const fresh = posts.filter((p) => {
      if (!p.posted_at) return true; // keep posts without timestamps
      const d = new Date(p.posted_at);
      if (isNaN(d.getTime())) return true;
      return now - d.getTime() < MAX_AGE_MS;
    });
    if (fresh.length < posts.length) {
      console.log(
        `Filtered ${posts.length - fresh.length} stale posts (older than ${MAX_AGE_DAYS}d)`,
      );
    }

    // Deduplicate by url
    const map = new Map();
    for (const p of fresh) {
      const key = (p.url || "") + "::" + (p.posted_at || "");
      const id = encodeId(key);
      if (!map.has(id)) map.set(id, { id, ...p });
    }

    const results = Array.from(map.values());
    const payload = JSON.stringify({
      posts: results,
      post_count: results.length,
      cached_at: new Date().toISOString(),
      feed: "threads-playwright",
    });

    // TTL 9000s (2.5 hours) — covers the 2h cron interval with buffer
    await redisSet("gigalertpro:threads:latest", payload, 9000);
    console.log(
      `Wrote ${results.length} threads posts to Upstash (key: gigalertpro:threads:latest, TTL 2.5h)`,
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
