// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — Reddit RSS Proxy + CDN Cache
// Fetches posts via RSS feeds (no API key needed).
// Combines non-search subreddits into one multi-sub request.
// Response is CDN-cached so thousands of users share one upstream fetch.
// ─────────────────────────────────────────────────────────────────────────────

// Non-search subs — fetched as ONE combined multi-sub RSS feed
const COMBINED_SUBS = [
  "hiring",
  "jobbit",
  "remotejs",
  "freelance_forhire",
  "gameDevClassifieds",
  "DesignJobs",
  "Jobs4Bitcoins",
  "WorkOnline",
];

// Search subs — each needs a separate RSS call with flair filter
const SEARCH_SUBS = [
  { name: "forhire", search: "flair:Hiring" },
  { name: "slavelabour", search: "flair:Task" },
];

const USER_AGENT =
  "Mozilla/5.0 (compatible; GigAlertPro/1.0; +https://gigalertpro.vercel.app)";

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Atom XML Parser (no dependencies) ────────────────────────────────────────

/** Strip HTML tags and decode common entities */
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract text between XML tags: <tag>content</tag> */
function xmlText(xml, tag) {
  const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(rx);
  return m ? m[1].trim() : "";
}

/** Extract attribute from self-closing or opening tag */
function xmlAttr(xml, tag, attr) {
  const rx = new RegExp(`<${tag}[^>]*?${attr}="([^"]*)"`, "i");
  const m = xml.match(rx);
  return m ? m[1] : "";
}

/** Parse a Reddit Atom feed into an array of post objects */
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

    // Extract Reddit post ID from the Atom id (e.g. "t3_abc123")
    const postIdMatch = id.match(/t3_(\w+)/);
    const postId = postIdMatch ? postIdMatch[1] : id;

    // Convert ISO date to Unix timestamp
    const createdUtc = updated ? Math.floor(new Date(updated).getTime() / 1000) : 0;

    // Extract permalink from link
    const permalink = link ? link.replace("https://www.reddit.com", "") : "";

    entries.push({
      id: postId,
      name: `t3_${postId}`,
      title,
      selftext: body.slice(0, 2000), // Cap body length
      author,
      permalink,
      subreddit: category,
      created_utc: createdUtc,
      num_comments: 0, // Not available in RSS
      ups: 0, // Not available in RSS
      link_flair_text: null, // Not available in RSS
      _sub: category,
    });
  }

  return entries;
}

// ── Fetch Functions ──────────────────────────────────────────────────────────

async function fetchRSS(url, label) {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
        redirect: "follow",
      });

      if (resp.status === 429) {
        const wait = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
        console.warn(`[scan-reddit] 429 on ${label}, retry ${attempt + 1}`);
        await delay(wait);
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.warn(`[scan-reddit] ${label}: ${resp.status} — ${body.slice(0, 200)}`);
        return { xml: null, status: resp.status, error: resp.statusText };
      }

      const xml = await resp.text();
      return { xml, status: resp.status, error: null };
    } catch (err) {
      console.error(`[scan-reddit] ${label} error:`, err.message);
      if (attempt === MAX_RETRIES) {
        return { xml: null, status: 0, error: err.message };
      }
      await delay(1000 * (attempt + 1));
    }
  }

  return { xml: null, status: 0, error: "Max retries exceeded" };
}

async function fetchAllPosts() {
  const diagnostics = [];
  const allPosts = [];

  // 1) Combined multi-sub feed (1 request for 8 subreddits)
  const combinedUrl = `https://www.reddit.com/r/${COMBINED_SUBS.join("+")}/new/.rss?limit=100`;
  const combined = await fetchRSS(combinedUrl, "combined");
  if (combined.xml) {
    const posts = parseAtomFeed(combined.xml, "combined");
    allPosts.push(...posts);
    diagnostics.push({
      source: `r/${COMBINED_SUBS.join("+")}`,
      status: combined.status,
      count: posts.length,
      error: null,
    });
  } else {
    diagnostics.push({
      source: `r/${COMBINED_SUBS.join("+")}`,
      status: combined.status,
      count: 0,
      error: combined.error,
    });
  }

  // Small delay between requests
  await delay(500);

  // 2) Search feeds (1 request each for flair-filtered subs)
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

    await delay(500);
  }

  return { allPosts, diagnostics };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { allPosts, diagnostics } = await fetchAllPosts();

    console.log(`[scan-reddit] Fetched ${allPosts.length} posts via RSS`);
    console.log(`[scan-reddit] Diagnostics:`, JSON.stringify(diagnostics));

    // CDN cache: 120s fresh, 10min stale-while-revalidate
    // Only ~3 Reddit requests every 2 min, thousands of users served from cache
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=600",
    );
    res.setHeader("Content-Type", "application/json");

    return res.status(200).json({
      posts: allPosts,
      cached_at: new Date().toISOString(),
      post_count: allPosts.length,
      feed: "rss",
      diagnostics,
    });
  } catch (err) {
    console.error(`[scan-reddit] Fatal error:`, err);
    return res.status(502).json({
      error: err.message || "Failed to fetch Reddit RSS",
      posts: [],
    });
  }
}
