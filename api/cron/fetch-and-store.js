import { classifyAndFilter } from "../../scripts/gig-classifier.js";

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USER_AGENT =
  "Mozilla/5.0 (compatible; GigAlertPro/1.0; +https://gigalertpro.com)";

const REDIS_KEY = "gigalertpro:latest";
const REDIS_TTL = parseInt(process.env.REDIS_TTL || "3600", 10);
const SEEN_KEY = "gigalertpro:seen:reddit";
const SEEN_TTL = 86400;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripHtml(html) {
  if (!html) return "";
  return (
    html
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x200B;/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/submitted\s+by\s+\/u\/\S+\s+to\s+r\/\S+.*?(\[link\]|\[comments\])[^
]*/gi, "")
      .replace(/\[link\]|\[comments\]/gi, "")
      .replace(/\s+/g, " ")
      .trim()
  );
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
    const body = stripHtml(xmlText(entry, "content"));
    const author = xmlText(entry, "name").replace(/^\/u\//, "");
    const updated = xmlText(entry, "updated");
    const category = xmlAttr(entry, "category", "term") || defaultSub;
    const id = xmlText(entry, "id");
    const postIdMatch = id.match(/t3_(\w+)/);
    const postId = postIdMatch ? postIdMatch[1] : id;
    const createdUtc = updated ? Math.floor(new Date(updated).getTime() / 1000) : 0;
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

async function fetchRSS(url) {
  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
        redirect: "follow",
      });
      if (resp.status === 429) {
        const wait = Math.pow(2, attempt + 2) * 1000 + Math.random() * 2000;
        await delay(wait);
        continue;
      }
      if (!resp.ok) return { xml: null, status: resp.status, error: resp.statusText };
      const xml = await resp.text();
      return { xml, status: resp.status, error: null };
    } catch (err) {
      if (attempt === MAX_RETRIES) return { xml: null, status: 0, error: err.message };
      await delay(1000 * (attempt + 1));
    }
  }
  return { xml: null, status: 0, error: "Max retries exceeded" };
}

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
];

const COMBINED_SUBS_2 = [
  "HireAnEditor",
  "ContentWriter_forhire",
  "IllustratorsForHire",
  "artistforhire",
  "forhire2",
  "YouTubeEditorsForHire",
  "VoiceWork",
  "VideoEditors_forhire",
  "VideoEditors",
  "VideoEditingJobs",
  "FindVideoEditors",
  "VoiceActing",
  "MarketingJobs",
  "hireforgigs",
  "ForHireFreelance",
  "DevsForHire",
  "Jobs4Bitcoins",
  "WritingJobBoard",
];

const SEARCH_SUBS = [{ name: "forhire", search: "flair:Hiring" }, { name: "slavelabour", search: "flair:Task" }];

async function fetchAllPosts() {
  const diagnostics = [];
  const allPosts = [];

  // batch 1
  const url1 = `https://www.reddit.com/r/${COMBINED_SUBS.join("+")}/new/.rss?limit=100`;
  const batch1 = await fetchRSS(url1);
  if (batch1.xml) {
    const posts = parseAtomFeed(batch1.xml, "combined");
    allPosts.push(...posts);
    diagnostics.push({ source: `r/${COMBINED_SUBS.join("+")}`, status: batch1.status, count: posts.length, error: null });
  } else {
    diagnostics.push({ source: `r/${COMBINED_SUBS.join("+")}`, status: batch1.status, count: 0, error: batch1.error });
  }
  await delay(2000);

  // batch 2
  const url2 = `https://www.reddit.com/r/${COMBINED_SUBS_2.join("+")}/new/.rss?limit=100`;
  const batch2 = await fetchRSS(url2);
  if (batch2.xml) {
    const posts = parseAtomFeed(batch2.xml, "combined");
    allPosts.push(...posts);
    diagnostics.push({ source: `r/${COMBINED_SUBS_2.join("+")}`, status: batch2.status, count: posts.length, error: null });
  } else {
    diagnostics.push({ source: `r/${COMBINED_SUBS_2.join("+")}`, status: batch2.status, count: 0, error: batch2.error });
  }
  await delay(2000);

  // search subs
  for (const sub of SEARCH_SUBS) {
    const searchUrl = `https://www.reddit.com/r/${sub.name}/search.rss?q=${encodeURIComponent(sub.search)}&restrict_sr=1&sort=new&limit=30`;
    const result = await fetchRSS(searchUrl);
    if (result.xml) {
      const posts = parseAtomFeed(result.xml, sub.name);
      allPosts.push(...posts);
      diagnostics.push({ source: `r/${sub.name}/search?q=${sub.search}`, status: result.status, count: posts.length, error: null });
    } else {
      diagnostics.push({ source: `r/${sub.name}/search?q=${sub.search}`, status: result.status, count: 0, error: result.error });
    }
    await delay(2000);
  }

  return { allPosts, diagnostics };
}

async function redisSet(key, value, ttlSeconds) {
  const resp = await fetch(`${UPSTASH_REDIS_REST_URL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["SET", key, value, "EX", ttlSeconds]),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Redis SET failed: ${resp.status} — ${body}`);
  }
  return resp.json();
}

async function redisGet(key) {
  const resp = await fetch(`${UPSTASH_REDIS_REST_URL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["GET", key]),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.result || null;
}

async function getSeenIds() {
  try {
    const resp = await fetch(`${UPSTASH_REDIS_REST_URL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SMEMBERS", SEEN_KEY]),
    });
    if (!resp.ok) return new Set();
    const data = await resp.json();
    return new Set(data.result || []);
  } catch {
    return new Set();
  }
}

async function markSeen(ids) {
  if (!ids || ids.length === 0) return;
  const commands = [["SADD", SEEN_KEY, ...ids], ["EXPIRE", SEEN_KEY, SEEN_TTL]];
  await fetch(`${UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  }).catch(() => {});
}

export default async function handler(req, res) {
  // Allow QStash (or manual) POSTs. Support GET for quick test.
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Optional simple shared-secret header to prevent abuse. Create a random secret and set env FETCH_SECRET.
  const secret = process.env.FETCH_SECRET;
  if (secret) {
    const incoming = (req.headers["x-fetch-secret"] || req.headers["fetch-secret"] || "").toString();
    if (!incoming || incoming !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    return res.status(500).json({ error: "Missing Upstash credentials" });
  }

  try {
    const start = Date.now();
    const { allPosts, diagnostics } = await fetchAllPosts();

    if (!allPosts || allPosts.length === 0) {
      return res.status(200).json({ message: "No posts fetched", diagnostics });
    }

    const seenIds = await getSeenIds();
    const newPosts = allPosts.filter((p) => !seenIds.has(p.id));
    const skipped = allPosts.length - newPosts.length;

    let freshGigs = [];
    if (newPosts.length > 0) {
      freshGigs = await classifyAndFilter(newPosts);
      await markSeen(newPosts.map((p) => p.id));
    }

    // Merge with existing stored gigs
    let existingGigs = [];
    try {
      const existingRaw = await redisGet(REDIS_KEY);
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw);
        existingGigs = parsed.posts || [];
      }
    } catch {
      existingGigs = [];
    }

    const mergedMap = new Map();
    for (const g of [...freshGigs, ...existingGigs]) {
      if (!mergedMap.has(g.id)) mergedMap.set(g.id, g);
    }
    const filteredPosts = [...mergedMap.values()].sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));

    if (filteredPosts.length === 0) {
      return res.status(200).json({ message: "No gigs after merge", skipped });
    }

    const payload = JSON.stringify({ posts: filteredPosts, cached_at: new Date().toISOString(), post_count: filteredPosts.length, feed: "rss-cached", diagnostics });

    await redisSet(REDIS_KEY, payload, REDIS_TTL);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    return res.status(200).json({ ok: true, stored: filteredPosts.length, new: freshGigs.length, skipped, elapsed_seconds: elapsed });
  } catch (err) {
    console.error("[cron] Error:", err);
    return res.status(500).json({ error: err.message || "Fetch failed" });
  }
}
