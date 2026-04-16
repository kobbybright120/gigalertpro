#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Wellfound (AngelList) Playwright Crawler
//
// Wellfound is a React SPA behind Cloudflare that requires full JS rendering.
// This script uses Playwright to browse the site, scroll to load jobs,
// extract listings, and store them in Upstash Redis.
//
// Run: node scripts/crawl-wellfound.js
// Cron: Every 30 minutes via GitHub Actions
// Redis key: gigalertpro:wellfound:latest (3-hour TTL)
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

const REDIS_KEY = "gigalertpro:wellfound:latest";
const REDIS_TTL = 10800; // 3 hours

// ── Redis helpers ────────────────────────────────────────────────────────────

function cleanEnv(val) {
  return (val || "").trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, "");
}

async function redisSet(key, value, ttlSeconds) {
  const url = cleanEnv(UPSTASH_REDIS_REST_URL);
  const token = cleanEnv(UPSTASH_REDIS_REST_TOKEN);
  if (!url || !token) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", key, value, "EX", ttlSeconds]),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn("[wellfound] Redis SET failed:", err.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main crawler ─────────────────────────────────────────────────────────────

async function crawl() {
  console.log("[wellfound] Starting Playwright crawl...");

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });

  const page = await context.newPage();
  const posts = [];

  try {
    // Navigate to contract/remote jobs
    await page.goto(
      "https://wellfound.com/jobs?remote=true&jobType=contract",
      { waitUntil: "networkidle", timeout: 30000 },
    );

    // Wait for page to render
    await sleep(3000);

    // Try to dismiss cookie consent if present
    try {
      const consentBtn = page.locator(
        'button:has-text("Accept"), button:has-text("Got it"), button:has-text("OK")',
      );
      if (await consentBtn.first().isVisible({ timeout: 2000 })) {
        await consentBtn.first().click();
        await sleep(500);
      }
    } catch {
      /* no cookie banner */
    }

    // Scroll 3 times to trigger lazy loading
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const delay = 2000 + Math.random() * 1500;
      await sleep(delay);
      console.log(`[wellfound] Scroll ${i + 1}/3 complete`);
    }

    // Scroll back up
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1000);

    // Extract job listings — try multiple selector strategies
    const jobs = await page.evaluate(() => {
      const results = [];

      // Strategy 1: Look for job card links with role URLs
      const roleLinks = document.querySelectorAll('a[href*="/role/"]');
      const seen = new Set();

      for (const link of roleLinks) {
        const href = link.getAttribute("href");
        if (!href || seen.has(href)) continue;
        seen.add(href);

        // Walk up to find the card container
        const card = link.closest('[class*="job"], [class*="listing"], [class*="card"], div') || link;

        // Extract title
        const titleEl = card.querySelector("h2, h3, h4, [class*='title'], [class*='name']");
        const title = titleEl?.textContent?.trim() || link.textContent?.trim() || "";
        if (!title || title.length < 3) continue;

        // Extract company
        const companyEl = card.querySelector(
          '[class*="company"], [class*="startup"], [class*="org"]',
        );
        const company = companyEl?.textContent?.trim() || "";

        // Extract salary/compensation
        const salaryEl = card.querySelector(
          '[class*="salary"], [class*="compensation"], [class*="pay"]',
        );
        const salary = salaryEl?.textContent?.trim() || "";

        // Extract location
        const locEl = card.querySelector(
          '[class*="location"], [class*="remote"]',
        );
        const location = locEl?.textContent?.trim() || "";

        // Full card text for description
        const fullText = card.textContent
          ?.replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000) || "";

        results.push({
          title,
          company,
          salary,
          location,
          description: fullText,
          url: href.startsWith("http") ? href : `https://wellfound.com${href}`,
        });
      }

      // Strategy 2: If no role links found, try general job card selectors
      if (results.length === 0) {
        const cards = document.querySelectorAll(
          '[data-test="job-listing"], [class*="JobListing"], [class*="jobCard"]',
        );
        for (const card of cards) {
          const link = card.querySelector("a[href]");
          const title =
            card.querySelector("h2, h3, h4")?.textContent?.trim() || "";
          if (!title) continue;
          results.push({
            title,
            company:
              card.querySelector('[class*="company"]')?.textContent?.trim() ||
              "",
            salary: "",
            location: "",
            description: card.textContent?.replace(/\s+/g, " ").trim().slice(0, 2000) || "",
            url: link?.href || "https://wellfound.com/jobs",
          });
        }
      }

      return results;
    });

    console.log(`[wellfound] Extracted ${jobs.length} job listings`);

    for (const job of jobs) {
      const id = `wellfound_${job.url.replace(/[^a-z0-9]/gi, "_").slice(-60)}`;
      posts.push({
        id,
        name: id,
        title: job.title,
        selftext: job.description.slice(0, 2000),
        author: job.company || "Wellfound",
        author_name: job.company || "Wellfound",
        permalink: job.url,
        subreddit: null,
        created_utc: Math.floor(Date.now() / 1000),
        num_comments: 0,
        ups: 0,
        link_flair_text: "Wellfound",
        compensation: job.salary || null,
        company: job.company || null,
        employment_type: "contract",
        location: job.location || "Remote",
        _sub: "wellfound",
        source: "wellfound",
        source_platform: "Wellfound",
      });
    }
  } catch (err) {
    console.error("[wellfound] Crawl error:", err.message);
  } finally {
    await browser.close();
  }

  // Store in Redis
  const payload = JSON.stringify({
    posts,
    cached_at: new Date().toISOString(),
    post_count: posts.length,
    feed: "wellfound",
  });

  await redisSet(REDIS_KEY, payload, REDIS_TTL);
  console.log(`[wellfound] ✅ Stored ${posts.length} posts in Redis (TTL: ${REDIS_TTL}s)`);
}

crawl().catch((err) => {
  console.error("[wellfound] Fatal error:", err);
  process.exit(1);
});
