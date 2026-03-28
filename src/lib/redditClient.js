// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Smart Reddit Gig Scanner Engine
// Fetches REAL job/gig postings from Reddit (clients looking to hire).
// Filters out freelancer self-promotions. Scores & ranks by relevance.
// ─────────────────────────────────────────────────────────────────────────────

// ── Subreddit Config ─────────────────────────────────────────────────────────
// Each entry defines name, fetch mode, and weight multiplier for scoring.
// "search" mode uses Reddit flair search to pre-filter at the API level.
const SUBREDDITS = [
  { name: "forhire", search: "flair:Hiring", mode: "search", weight: 1.3 },
  { name: "slavelabour", search: "flair:Task", mode: "search", weight: 1.2 },
  { name: "hiring", mode: "new", weight: 1.2 },
  { name: "jobbit", mode: "new", weight: 1.0 },
  { name: "remotejs", mode: "new", weight: 1.0 },
  { name: "freelance_forhire", mode: "new", weight: 1.0 },
  { name: "gameDevClassifieds", mode: "new", weight: 0.9 },
  { name: "DesignJobs", mode: "new", weight: 1.0 },
  { name: "Jobs4Bitcoins", mode: "new", weight: 0.8 },
  { name: "WorkOnline", mode: "new", weight: 0.8 },
];

// ── Cache (persisted in sessionStorage to survive HMR reloads) ───────────────
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 min
const CACHE_KEY = "gigalertpro_reddit_cache";
function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c.data && c.ts && Date.now() - c.ts < CACHE_TTL_MS) return c;
    }
  } catch {
    /* ignore */
  }
  return { data: null, ts: 0 };
}
function saveCache(c) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}
let cache = loadCache();

// ── Gig Categories ───────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    label: "Development",
    icon: "code",
    rx: /\b(develop|coding|programm|software|web\s?dev|frontend|backend|full.?stack|react|angular|vue|node|python|java|php|ruby|swift|flutter|mobile\s?app|android|ios|api|database|wordpress|shopify|wix|squarespace|html|css|javascript|typescript)\b/i,
  },
  {
    label: "Design",
    icon: "palette",
    rx: /\b(design|logo|graphic|ui\/?ux|figma|photoshop|illustrat|brand|visual|banner|poster|flyer|infographic|thumbnail|canva)\b/i,
  },
  {
    label: "Writing",
    icon: "pen",
    rx: /\b(writ|copywriting|content|blog|article|seo\s?writ|ghostwrit|technical\s?writ|edit|proofread|translat|transcript)\b/i,
  },
  {
    label: "Marketing",
    icon: "megaphone",
    rx: /\b(market|seo|social\s?media|ads?\b|advertis|email\s?market|ppc|google\s?ads|facebook\s?ads|growth|funnel|lead\s?gen|influencer)\b/i,
  },
  {
    label: "Video & Audio",
    icon: "video",
    rx: /\b(video|animation|motion|after\s?effects|premiere|youtube|podcast|audio|voice.?over|narrator)\b/i,
  },
  {
    label: "Data & AI",
    icon: "brain",
    rx: /\b(data|machine\s?learn|ai\b|artificial|scraping|analy|automat|bot|chatbot|gpt|llm|neural|deep\s?learn)\b/i,
  },
  {
    label: "Virtual Assistant",
    icon: "headset",
    rx: /\b(virtual\s?assistant|va\b|admin|data\s?entry|research|customer\s?service|support|bookkeep|scheduling)\b/i,
  },
];

// ── Self-Promotion Detection (freelancer ads — we REJECT these) ──────────────
const SELF_PROMO_PATTERNS = [
  /\[for\s?hire\]/i,
  /\bfor\s?hire\b/i,
  /\bhire\s?me\b/i,
  /\[offer\]/i,
  /\bi\s?(?:am|'m)\s+a\b.{0,40}\b(designer|developer|writer|editor|freelanc|coder|artist|programmer|marketer|consultant|engineer|animator|videograph)/i,
  /\bi\s?(?:am|'m)\s+an?\s+experienced\b/i,
  /\boffering\s+my\b/i,
  /\boffering\b.{0,25}\bservices?\b/i,
  /\bavailable\s+for\b.{0,25}\b(work|projects?|freelanc|gigs?|hire)\b/i,
  /\blooking\s+for\b.{0,25}\b(work|clients?|projects?|opportunities|gigs?)\b/i,
  /\bmy\s+(?:services|portfolio|rates?|work)\b/i,
  /\bcheck\s+out\s+my\b/i,
  /\bopen\s+(?:to|for)\s+(?:work|commissions|projects?)\b/i,
  /\bi\s+(?:specialize|specialise)\b/i,
  /\byears?\s+(?:of\s+)?experience\b.{0,30}\b(?:in|with)\b/i,
  /\bportfolio\s*:/i,
  /\bhere\s+(?:is|are)\s+(?:my|some)\b.{0,20}\b(?:work|samples?|examples?)\b/i,
];

// ── Hiring Signals (clients seeking work — we WANT these) ────────────────────
const HIRING_SIGNALS = [
  { rx: /\[hiring\]/i, score: 25 },
  { rx: /\[task\]/i, score: 25 },
  { rx: /\[paid\]/i, score: 20 },
  { rx: /\bhiring\b/i, score: 15 },
  {
    rx: /\blooking\s+for\b.{0,35}\b(?:a|an)?\s*(?:designer|developer|writer|editor|freelanc|coder|programmer|marketer|va|virtual\s?assistant|consultant|someone|contractor|expert|specialist|agency)/i,
    score: 20,
  },
  {
    rx: /\bneed\b.{0,25}\b(?:a|an)?\s*(?:designer|developer|writer|editor|freelanc|coder|programmer|marketer|consultant|someone|help|person|expert)\b/i,
    score: 18,
  },
  {
    rx: /\bseeking\b.{0,25}\b(?:a|an)?\s*(?:designer|developer|writer|freelanc|someone|expert|contractor)/i,
    score: 16,
  },
  {
    rx: /\bwant\b.{0,25}\b(?:someone|a|an)\b.{0,35}\b(?:to|who)\b/i,
    score: 14,
  },
  { rx: /\bwill\s+pay\b/i, score: 15 },
  { rx: /\bi(?:'ll| will)\s+pay\b/i, score: 15 },
  { rx: /\bpaying\b/i, score: 12 },
  { rx: /\bbudget\b.{0,10}\b\$?\d/i, score: 14 },
  { rx: /\bcompensation\b/i, score: 10 },
  {
    rx: /\bjob\b.{0,15}\b(?:posting|opening|opportunity|position|listing)\b/i,
    score: 12,
  },
  { rx: /\bwe(?:'re|\s+are)\s+looking\b/i, score: 16 },
  {
    rx: /\bour\s+(?:team|company|startup|agency|firm)\b.{0,35}\b(?:needs?|looking|seeking|hiring|searching)\b/i,
    score: 18,
  },
  { rx: /\bproject\b.{0,15}\b(?:budget|rate|pay|compensation)\b/i, score: 12 },
  {
    rx: /\bremote\b.{0,15}\b(?:position|role|job|gig|opportunity|work)\b/i,
    score: 8,
  },
  { rx: /\bfixed\s+(?:price|budget|rate|fee)\b/i, score: 10 },
  { rx: /\bhourly\s+(?:rate|pay|budget|compensation)\b/i, score: 10 },
  { rx: /\bper\s+(?:hour|project|page|word|article)\b/i, score: 8 },
  { rx: /\bcan\s+(?:someone|anyone|anybody)\b/i, score: 12 },
  { rx: /\bhelp\s+(?:me|us|needed|wanted|required)\b/i, score: 10 },
];

// ── Junk / Noise Filters ────────────────────────────────────────────────────
const JUNK_PATTERNS = [
  /\[meta\]/i,
  /\[mod\s?post\]/i,
  /\[announcement\]/i,
  /\bweekly\s+thread\b/i,
  /\bmonthly\s+thread\b/i,
  /\brule\s+\d/i,
  /\bautomod/i,
  /\bsubreddit\s+rules?\b/i,
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract budget/price from text — handles $500, $50/hr, $1k-$5k, etc. */
function extractBudget(text) {
  if (!text) return null;
  // Range: $500-$1000, $1k-5k
  const range = text.match(
    /\$\s?[\d,]+(?:\.\d{1,2})?(?:k)?\s*[-–—to]+\s*\$?\s?[\d,]+(?:\.\d{1,2})?(?:k)?/i,
  );
  if (range) return range[0].replace(/\s+/g, " ").trim();
  // Hourly: $50/hr, $30 per hour
  const hourly = text.match(
    /\$\s?[\d,]+(?:\.\d{1,2})?\s*(?:\/\s*h(?:ou)?r|per\s+h(?:ou)?r)/i,
  );
  if (hourly) return hourly[0].replace(/\s+/g, " ").trim();
  // "k" shorthand: $5k, $2.5k
  const kMatch = text.match(/\$\s?[\d,.]+\s*k\b/i);
  if (kMatch) return kMatch[0].replace(/\s+/g, "");
  // Plain: $500
  const plain = text.match(/\$\s?[\d,]+(?:\.\d{1,2})?/);
  return plain ? plain[0].replace(/\s/g, "") : null;
}

/** Return "2h ago", "3d ago", etc. */
function timeAgo(utcSeconds) {
  const now = Date.now();
  const then = utcSeconds * 1000;
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Detect gig category from title + body */
function detectCategory(text) {
  for (const cat of CATEGORIES) {
    if (cat.rx.test(text)) return { label: cat.label, icon: cat.icon };
  }
  return { label: "Other", icon: "briefcase" };
}

/** True if post is a freelancer self-promotion (not a job posting) */
function isSelfPromotion(title, body) {
  // Explicit title tags are definitive — never override
  if (/\[for\s?hire\]/i.test(title) || /\[offer\]/i.test(title)) return true;
  if (/\bfor\s?hire\b/i.test(title) && !/\[hiring\]/i.test(title)) return true;

  // Strong hiring signal in the TITLE (not body) overrides body self-promo
  if (HIRING_SIGNALS.some((s) => s.rx.test(title))) return false;

  const text = title + " " + body;
  return SELF_PROMO_PATTERNS.some((rx) => rx.test(text));
}

/** True if post is junk (mod post, rules thread, etc.) */
function isJunk(title) {
  return JUNK_PATTERNS.some((rx) => rx.test(title));
}

/** Compute a 0-100 relevance score for a post */
function computeScore(
  post,
  matchedKwCount,
  totalKws,
  subWeight,
  titleHits = 0,
) {
  let score = 0;
  const text = (post.title || "") + " " + (post.selftext || "");

  // ── Hiring signal strength (0-40 pts) ──
  let hiringPts = 0;
  for (const signal of HIRING_SIGNALS) {
    if (signal.rx.test(text)) hiringPts += signal.score;
  }
  score += Math.min(40, hiringPts);

  // ── Keyword match density (0-25 pts) ──
  score += Math.min(
    25,
    Math.round((matchedKwCount / Math.max(1, totalKws)) * 25),
  );

  // ── Title match bonus (0-15 pts) — keywords in title are far more relevant ──
  if (titleHits > 0) {
    score += Math.min(15, titleHits * 10);
  }

  // ── Budget mentioned (0-10 pts) ──
  if (/\$\s?\d/.test(text)) score += 10;

  // ── Recency bonus (0-15 pts) ──
  if (post.created_utc) {
    const ageHours = (Date.now() / 1000 - post.created_utc) / 3600;
    if (ageHours < 1) score += 15;
    else if (ageHours < 6) score += 12;
    else if (ageHours < 24) score += 8;
    else if (ageHours < 72) score += 4;
  }

  // ── Engagement bonus (0-5 pts) ──
  const comments = post.num_comments || 0;
  if (comments >= 1 && comments <= 10) score += 3; // Some interest, not saturated
  if (comments === 0) score += 5; // Fresh — no one applied yet!

  // ── Subreddit weight multiplier ──
  score = Math.round(score * (subWeight || 1));

  // ── Post length bonus (detail = more legit) (0-5 pts) ──
  const bodyLen = (post.selftext || "").length;
  if (bodyLen > 200) score += 5;
  else if (bodyLen > 50) score += 2;

  return Math.min(100, Math.max(0, score));
}

// ── Reddit Fetch ─────────────────────────────────────────────────────────────

const IS_PROD = import.meta.env.PROD;

/**
 * PRODUCTION: Single fetch to our Vercel serverless proxy (CDN-cached).
 * Returns all posts from all subreddits in one request.
 */
async function fetchAllPostsFromProxy() {
  try {
    const resp = await fetch("/api/scan-reddit", {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) {
      console.error(
        `[GigAlertPro] API returned ${resp.status}: ${resp.statusText}`,
      );
      return [];
    }
    const json = await resp.json();
    console.log(
      `[GigAlertPro] API returned ${json.post_count || 0} posts (${json.feed || "unknown"})`,
      json.diagnostics || "no diagnostics",
    );
    return (json.posts || []).map((p) => ({
      ...p,
      _weight: SUBREDDITS.find((s) => s.name === p._sub)?.weight || 1.0,
    }));
  } catch (err) {
    console.error("[GigAlertPro] API fetch failed:", err.message);
    return [];
  }
}

/**
 * DEV: Per-subreddit fetch via Vite proxy (bypasses CORS locally).
 */
async function fetchSubreddit(sub) {
  let url;
  if (sub.mode === "search") {
    url = `/reddit-api/r/${sub.name}/search.json?q=${encodeURIComponent(sub.search)}&restrict_sr=1&sort=new&limit=30&raw_json=1`;
  } else {
    url = `/reddit-api/r/${sub.name}/new.json?limit=30&raw_json=1`;
  }

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (resp.status === 429) {
    await delay(5000 + Math.random() * 3000);
    const retry = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!retry.ok) return [];
    try {
      const json = await retry.json();
      return json?.data?.children?.map((c) => c.data) || [];
    } catch {
      return [];
    }
  }

  if (!resp.ok) return [];
  try {
    const json = await resp.json();
    return json?.data?.children?.map((c) => c.data) || [];
  } catch {
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches real Reddit JOB POSTINGS matching keywords.
 * Returns scored, categorized, deduplicated results — most relevant first.
 */
export async function fetchRedditGigs(keywords) {
  if (!keywords || keywords.length === 0) return [];

  const lowerKws = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
  if (lowerKws.length === 0) return [];

  // Return cache if still fresh
  if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return matchAndScore(cache.data, lowerKws);
  }

  let allPosts;
  if (IS_PROD) {
    // PRODUCTION — single CDN-cached fetch from Vercel proxy
    allPosts = await fetchAllPostsFromProxy();
  } else {
    // DEV — per-subreddit via Vite proxy
    allPosts = [];
    const BATCH = 2;
    for (let i = 0; i < SUBREDDITS.length; i += BATCH) {
      const batch = SUBREDDITS.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((sub) =>
          fetchSubreddit(sub).then((posts) =>
            posts.map((p) => ({ ...p, _sub: sub.name, _weight: sub.weight })),
          ),
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled") allPosts.push(...r.value);
      }
      if (i + BATCH < SUBREDDITS.length) await delay(600);
    }
  }

  cache = { data: allPosts, ts: Date.now() };
  saveCache(cache);
  return matchAndScore(allPosts, lowerKws);
}

/** Clear the post cache (useful after keyword changes) */
export function clearCache() {
  cache = { data: null, ts: 0 };
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// ── Matching, Scoring & Ranking ──────────────────────────────────────────────
function matchAndScore(posts, lowerKws) {
  const seen = new Set();
  const results = [];

  for (const p of posts) {
    // ── Dedup by Reddit post ID ──
    const postId = p.id || p.name;
    if (seen.has(postId)) continue;
    seen.add(postId);

    // ── Skip junk (mod posts, rules, meta) ──
    if (isJunk(p.title || "")) continue;

    // ── Skip deleted / removed ──
    if (p.selftext === "[removed]" || p.selftext === "[deleted]") continue;
    if (p.author === "[deleted]" || p.author === "AutoModerator") continue;

    // ── Skip self-promotions (freelancer ads) ──
    if (isSelfPromotion(p.title || "", p.selftext || "")) continue;

    // ── Keyword matching — title matches weighted higher ──
    const titleLower = (p.title || "").toLowerCase();
    const bodyLower = (p.selftext || "").toLowerCase();
    const combined = titleLower + " " + bodyLower;

    let titleHits = 0;
    const matched = lowerKws.filter((kw) => {
      let inTitle = false;
      let found = false;
      if (kw.includes(" ")) {
        // Multi-word: exact phrase match
        found = combined.includes(kw);
        inTitle = titleLower.includes(kw);
      } else {
        // Single word: word boundary
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(`\\b${escaped}\\b`, "i");
        found = rx.test(combined);
        inTitle = rx.test(titleLower);
      }
      if (found && inTitle) titleHits++;
      return found;
    });
    if (matched.length === 0) continue;

    // ── Score (title matches get a bonus) ──
    const score = computeScore(
      p,
      matched.length,
      lowerKws.length,
      p._weight,
      titleHits,
    );

    // ── Category ──
    const category = detectCategory(combined);

    // ── Budget ──
    const budget = extractBudget((p.title || "") + " " + (p.selftext || ""));

    results.push({
      id: postId,
      reddit_post_id: p.name || p.id,
      title: p.title || "Untitled",
      body_preview: (p.selftext || "").slice(0, 400),
      url: `https://www.reddit.com${p.permalink}`,
      subreddit: p._sub || p.subreddit,
      budget,
      author: p.author || "unknown",
      reddit_created: p.created_utc
        ? new Date(p.created_utc * 1000).toISOString()
        : new Date().toISOString(),
      matched_keywords: matched,
      score,
      category: category.label,
      category_icon: category.icon,
      time_ago: p.created_utc ? timeAgo(p.created_utc) : "recently",
      comment_count: p.num_comments || 0,
      upvotes: p.ups || 0,
      flair: p.link_flair_text || null,
    });
  }

  // ── Sort: primary by score (desc), secondary by recency (desc) ──
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.reddit_created) - new Date(a.reddit_created);
  });

  return results;
}
