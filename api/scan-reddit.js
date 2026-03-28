// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Reddit Proxy + CDN Cache
// Fetches raw posts from all tracked subreddits server-side (no CORS).
// Response is CDN-cached so thousands of users share one upstream fetch.
// Uses old.reddit.com — much more reliable from datacenter IPs.
// ─────────────────────────────────────────────────────────────────────────────

const SUBREDDITS = [
  { name: "forhire", search: "flair:Hiring", mode: "search" },
  { name: "slavelabour", search: "flair:Task", mode: "search" },
  { name: "hiring", mode: "new" },
  { name: "jobbit", mode: "new" },
  { name: "remotejs", mode: "new" },
  { name: "freelance_forhire", mode: "new" },
  { name: "gameDevClassifieds", mode: "new" },
  { name: "DesignJobs", mode: "new" },
  { name: "Jobs4Bitcoins", mode: "new" },
  { name: "WorkOnline", mode: "new" },
];

// Use old.reddit.com — www.reddit.com blocks/throttles datacenter IPs
const REDDIT_BASE = "https://old.reddit.com";
const BATCH_SIZE = 5;
const USER_AGENT =
  "Mozilla/5.0 (compatible; GigAlertPro/1.0; +https://gigalertpro.vercel.app)";

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a single subreddit with exponential backoff on 429.
 * Returns an array of raw Reddit post objects.
 */
async function fetchSubreddit(sub) {
  let url;
  if (sub.mode === "search") {
    url = `${REDDIT_BASE}/r/${sub.name}/search.json?q=${encodeURIComponent(sub.search)}&restrict_sr=1&sort=new&limit=30&raw_json=1`;
  } else {
    url = `${REDDIT_BASE}/r/${sub.name}/new.json?limit=30&raw_json=1`;
  }

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          Accept: "text/html,application/json",
          "User-Agent": USER_AGENT,
        },
        redirect: "follow",
      });

      if (resp.status === 429) {
        const wait = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
        console.warn(`[scan-reddit] 429 on r/${sub.name}, retry in ${Math.round(wait)}ms`);
        await delay(wait);
        continue;
      }

      if (!resp.ok) {
        console.warn(`[scan-reddit] r/${sub.name}: ${resp.status} ${resp.statusText}`);
        return [];
      }

      const json = await resp.json();
      const posts = json?.data?.children?.map((c) => c.data) || [];
      return posts.map((p) => ({
        id: p.id,
        name: p.name,
        title: p.title,
        selftext: p.selftext,
        author: p.author,
        permalink: p.permalink,
        subreddit: p.subreddit,
        created_utc: p.created_utc,
        num_comments: p.num_comments,
        ups: p.ups,
        link_flair_text: p.link_flair_text,
        _sub: sub.name,
      }));
    } catch (err) {
      console.error(`[scan-reddit] r/${sub.name} error:`, err.message);
      if (attempt === MAX_RETRIES) return [];
      await delay(1000 * (attempt + 1));
    }
  }
  return [];
}

/**
 * Fetch all subreddits in parallel batches with polite delays.
 */
async function fetchAllSubreddits() {
  const allPosts = [];
  const errors = [];
  for (let i = 0; i < SUBREDDITS.length; i += BATCH_SIZE) {
    const batch = SUBREDDITS.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(fetchSubreddit));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        allPosts.push(...r.value);
      } else {
        errors.push(`r/${batch[j].name}: ${r.reason?.message || "unknown"}`);
      }
    }
    if (i + BATCH_SIZE < SUBREDDITS.length) await delay(300);
  }
  return { allPosts, errors };
}

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { allPosts, errors } = await fetchAllSubreddits();

    console.log(`[scan-reddit] Fetched ${allPosts.length} posts, ${errors.length} errors`);
    if (errors.length > 0) console.warn(`[scan-reddit] Errors:`, errors);

    // CDN cache: serve cached for 90s, stale-while-revalidate for 3 more min
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=90, stale-while-revalidate=180",
    );
    res.setHeader("Content-Type", "application/json");

    return res.status(200).json({
      posts: allPosts,
      cached_at: new Date().toISOString(),
      post_count: allPosts.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error(`[scan-reddit] Fatal error:`, err);
    return res
      .status(502)
      .json({ error: err.message || "Failed to fetch Reddit data", posts: [] });
  }
}
