import fs from "fs/promises";
import { chromium } from "playwright";

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
  const context = await browser.newContext({ userAgent: "GigAlertPro/1.0" });
  const page = await context.newPage();
  const collected = [];

  for (const seed of seeds) {
    try {
      console.log("Visiting:", seed);
      await page.goto(seed, { waitUntil: "networkidle", timeout: 60000 });
      // Small delay to allow dynamic content
      await page.waitForTimeout(1000 + Math.random() * 1500);

      const pagePosts = await page.evaluate(() => {
        const out = [];

        const articles = Array.from(document.querySelectorAll("article"));
        if (articles.length > 0) {
          for (const el of articles.slice(0, 40)) {
            try {
              const timeEl = el.querySelector("time");
              const time = timeEl ? timeEl.getAttribute("datetime") : null;
              const authorEl =
                el.querySelector('a[href*="/@"]') || el.querySelector("a");
              const author = authorEl ? authorEl.innerText.trim() : null;
              const contentEl = el.querySelector('div[dir="auto"]') || el;
              let text = contentEl?.innerText || "";
              text = text.replace(/\s+/g, " ").trim();
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
        } else {
          // fallback to meta tags / single page
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
          out.push({
            title: title.slice(0, 120),
            body_preview: description.slice(0, 400),
            author:
              document.querySelector('meta[name="author"]')?.content || null,
            posted_at: time,
            url: window.location.href,
          });
        }

        return out;
      });

      collected.push(...pagePosts);
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

    const posts = await crawlSeeds(seeds);

    // Deduplicate by url+posted_at
    const map = new Map();
    for (const p of posts) {
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

    await redisSet("gigalertpro:threads:latest", payload, 3600);
    console.log(
      "Wrote",
      results.length,
      "threads posts to Upstash (key: gigalertpro:threads:latest)",
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
