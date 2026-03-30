#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Scheduled Fetcher — Runs via GitHub Actions every 5 minutes
// Fetches Reddit RSS feeds, parses to JSON, stores in Upstash Redis.
// The API endpoint then reads from Redis (fast KV read, no Reddit calls).
// ─────────────────────────────────────────────────────────────────────────────

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

// ── Config ───────────────────────────────────────────────────────────────────

const COMBINED_SUBS = [
  "hiring",
  "freelance_forhire",
  "gameDevClassifieds",
  "DesignJobs",
  "ProgrammingJobs",
  "CodingJobs",
  "Programmers_forhire",
  "SoftwareEngineerJobs",
  "WebDeveloperJobs",
  "techjobs",
  "WebDevJobs",
  "MachineLearningJobs",
  "DeveloperJobs",
  "GraphicDesignJobs",
  "Designers_forhire",
  "HireAnEditor",
  "ContentWriter_forhire",
  "IllustratorsForHire",
  "artistforhire",
  "forhire2",
  "YouTubeEditorsForHire",
  "VoiceWork",
  "VideoEditors_forhire",
  "VoiceActing",
  "MarketingJobs",
  "hireforgigs",
  "ForHireFreelance",
  "DevsForHire",
  "Jobs4Bitcoins",
  "WritingJobBoard",
];

const SEARCH_SUBS = [
  { name: "forhire", search: "flair:Hiring" },
  { name: "slavelabour", search: "flair:Task" },
];

const USER_AGENT =
  "Mozilla/5.0 (compatible; GigAlertPro/1.0; +https://gigalertpro.vercel.app)";

const REDIS_KEY = "gigalertpro:latest";
const REDIS_TTL = 3600; // 1 hour TTL (cron refreshes every 2 min, this is just a safety net)

// ── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x200B;/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlText(xml, tag) {
  const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(rx);
  return m ? m[1].trim() : "";
}

function xmlAttr(xml, tag, attr) {
  const rx = new RegExp(`<${tag}[^>]*?${attr}="([^"]*)"`, "i");
  const m = xml.match(rx);
  return m ? m[1] : "";
}

function parseAtomFeed(xml, defaultSub) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const title = stripHtml(xmlText(entry, "title"));
    const link = xmlAttr(entry, "link", "href");
    const contentRaw = xmlText(entry, "content");
    const body = stripHtml(contentRaw);
    const author = xmlText(entry, "name").replace(/^\/u\//, "");
    const updated = xmlText(entry, "updated");
    const category = xmlAttr(entry, "category", "term") || defaultSub;
    const id = xmlText(entry, "id");
    const postIdMatch = id.match(/t3_(\w+)/);
    const postId = postIdMatch ? postIdMatch[1] : id;
    const createdUtc = updated
      ? Math.floor(new Date(updated).getTime() / 1000)
      : 0;
    const permalink = link ? link.replace("https://www.reddit.com", "") : "";

    entries.push({
      id: postId,
      name: `t3_${postId}`,
      title,
      selftext: body.slice(0, 2000),
      author,
      permalink,
      subreddit: category,
      created_utc: createdUtc,
      num_comments: 0,
      ups: 0,
      link_flair_text: null,
      _sub: category,
    });
  }
  return entries;
}

// ── RSS Fetch ────────────────────────────────────────────────────────────────

async function fetchRSS(url, label) {
  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
        redirect: "follow",
      });

      if (resp.status === 429) {
        const wait = Math.pow(2, attempt + 2) * 1000 + Math.random() * 2000;
        console.warn(
          `[fetcher] 429 on ${label}, retry ${attempt + 1} (wait ${Math.round(wait / 1000)}s)`,
        );
        await delay(wait);
        continue;
      }

      if (!resp.ok) {
        console.warn(`[fetcher] ${label}: ${resp.status}`);
        return { xml: null, status: resp.status, error: resp.statusText };
      }

      const xml = await resp.text();
      return { xml, status: resp.status, error: null };
    } catch (err) {
      console.error(`[fetcher] ${label} error:`, err.message);
      if (attempt === MAX_RETRIES)
        return { xml: null, status: 0, error: err.message };
      await delay(1000 * (attempt + 1));
    }
  }
  return { xml: null, status: 0, error: "Max retries exceeded" };
}

async function fetchAllPosts() {
  const diagnostics = [];
  const allPosts = [];

  // 1) Combined multi-sub feeds (split into batches to keep URLs short)
  const MID = Math.ceil(COMBINED_SUBS.length / 2);
  const batches = [COMBINED_SUBS.slice(0, MID), COMBINED_SUBS.slice(MID)];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchLabel = `combined-${i + 1}`;
    const url = `https://www.reddit.com/r/${batch.join("+")}/new/.rss?limit=100`;
    const result = await fetchRSS(url, batchLabel);
    if (result.xml) {
      const posts = parseAtomFeed(result.xml, "combined");
      allPosts.push(...posts);
      diagnostics.push({
        source: `r/${batch.join("+")}`,
        status: result.status,
        count: posts.length,
        error: null,
      });
    } else {
      diagnostics.push({
        source: `r/${batch.join("+")}`,
        status: result.status,
        count: 0,
        error: result.error,
      });
    }
    if (i < batches.length - 1) await delay(2000);
  }

  await delay(2000);

  // 2) Search feeds
  for (const sub of SEARCH_SUBS) {
    const searchUrl = `https://www.reddit.com/r/${sub.name}/search.rss?q=${encodeURIComponent(sub.search)}&restrict_sr=1&sort=new&limit=30`;
    const result = await fetchRSS(searchUrl, `r/${sub.name}/search`);
    if (result.xml) {
      const posts = parseAtomFeed(result.xml, sub.name);
      allPosts.push(...posts);
      diagnostics.push({
        source: `r/${sub.name}/search?q=${sub.search}`,
        status: result.status,
        count: posts.length,
        error: null,
      });
    } else {
      diagnostics.push({
        source: `r/${sub.name}/search?q=${sub.search}`,
        status: result.status,
        count: 0,
        error: result.error,
      });
    }
    await delay(2000);
  }

  return { allPosts, diagnostics };
}

// ── Upstash Redis (REST API — zero dependencies) ────────────────────────────

async function redisSet(key, value, ttlSeconds) {
  const resp = await fetch(`${UPSTASH_REDIS_REST_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", key, value, "EX", ttlSeconds]),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Redis SET failed: ${resp.status} — ${body}`);
  }
  return resp.json();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[fetcher] Starting RSS fetch...");
  const start = Date.now();

  const { allPosts, diagnostics } = await fetchAllPosts();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[fetcher] Fetched ${allPosts.length} posts in ${elapsed}s`);
  console.log("[fetcher] Diagnostics:", JSON.stringify(diagnostics));

  if (allPosts.length === 0) {
    console.warn(
      "[fetcher] 0 posts — skipping Redis write to preserve last-good data",
    );
    process.exit(0);
  }

  // Build the payload (same shape the API returns)
  const payload = JSON.stringify({
    posts: allPosts,
    cached_at: new Date().toISOString(),
    post_count: allPosts.length,
    feed: "rss-cached",
    diagnostics,
  });

  console.log(
    `[fetcher] Storing ${(payload.length / 1024).toFixed(0)} KB in Upstash Redis...`,
  );

  await redisSet(REDIS_KEY, payload, REDIS_TTL);

  console.log(
    `[fetcher] ✅ Done. ${allPosts.length} posts stored (TTL ${REDIS_TTL}s).`,
  );
}

main().catch((err) => {
  console.error("[fetcher] Fatal:", err);
  process.exit(1);
});
