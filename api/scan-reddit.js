// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Reddit Proxy + CDN Cache
// Fetches raw posts from all tracked subreddits server-side (no CORS).
// Response is CDN-cached so thousands of users share one upstream fetch.
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

const BATCH_SIZE = 3;
const USER_AGENT = "GigAlertPro/1.0 (server-side proxy)";

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
    url = `https://www.reddit.com/r/${sub.name}/search.json?q=${encodeURIComponent(sub.search)}&restrict_sr=1&sort=new&limit=30&raw_json=1`;
  } else {
    url = `https://www.reddit.com/r/${sub.name}/new.json?limit=30&raw_json=1`;
  }

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      if (resp.status === 429) {
        // Exponential backoff: 2s, 4s, 8s + jitter
        const wait = Math.pow(2, attempt + 1) * 1000 + Math.random() * 2000;
        await delay(wait);
        continue;
      }

      if (!resp.ok) return [];

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
    } catch {
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
  for (let i = 0; i < SUBREDDITS.length; i += BATCH_SIZE) {
    const batch = SUBREDDITS.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(fetchSubreddit));
    for (const r of results) {
      if (r.status === "fulfilled") allPosts.push(...r.value);
    }
    // Polite delay between batches (not after last batch)
    if (i + BATCH_SIZE < SUBREDDITS.length) await delay(500);
  }
  return allPosts;
}

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const posts = await fetchAllSubreddits();

    // CDN cache: serve cached for 90s, stale-while-revalidate for 3 more min
    // This means Vercel's edge CDN serves cached data to thousands of users,
    // and only makes a new Reddit fetch every ~90 seconds.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=90, stale-while-revalidate=180",
    );
    res.setHeader("Content-Type", "application/json");

    return res.status(200).json({
      posts,
      cached_at: new Date().toISOString(),
      post_count: posts.length,
    });
  } catch {
    return res
      .status(502)
      .json({ error: "Failed to fetch Reddit data", posts: [] });
  }
}
