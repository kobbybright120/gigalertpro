#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — RemoteOK Dedicated Scanner
//
// Fetches freelance/contract gig posts from RemoteOK JSON API.
// 48-HOUR freshness window — rejects any job older than 48 hours.
//
// AI FILTER: Uses GPT-4o-mini to keep only genuine freelance/contract roles.
// RemoteOK-specific gold lead scoring boost (bypasses keyword-intent gate).
// Stores results in Upstash Redis under its own key.
//
// Tags are fetched in parallel batches of 10 for efficiency.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyAndFilter } from "./gig-classifier.js";

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

// ── Config ───────────────────────────────────────────────────────────────────

const REDIS_KEY = "gigalertpro:remoteok:latest";
const REDIS_TTL = 7200; // 2 hours
const MAX_POSTS = 300;
const SEEN_KEY = "gigalertpro:seen:remoteok";
const SEEN_TTL = 86400; // 24 hours

const MAX_AGE_SEC = 48 * 3600; // 48 hours

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Upstash Redis REST ───────────────────────────────────────────────────────

function redisUrl() {
  return (UPSTASH_REDIS_REST_URL || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
}
function redisToken() {
  return (UPSTASH_REDIS_REST_TOKEN || "").trim().replace(/^["']+|["']+$/g, "");
}

async function redisGet(key) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) return null;
  try {
    const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.result || null;
  } catch {
    return null;
  }
}

async function redisSet(key, value, ttlSeconds) {
  const url = redisUrl();
  const token = redisToken();
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
  } catch {
    /* best effort */
  }
}

async function redisSadd(key, members, ttl) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token || members.length === 0) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SADD", key, ...members]),
      signal: AbortSignal.timeout(5000),
    });
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EXPIRE", key, ttl]),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* best effort */
  }
}

async function redisSmembers(key) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) return new Set();
  try {
    const resp = await fetch(`${url}/smembers/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return new Set();
    const json = await resp.json();
    return new Set(json.result || []);
  } catch {
    return new Set();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
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
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithRetry(url, opts = {}, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": CHROME_UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...opts.headers,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
        ...opts,
      });
      if (resp.status === 429) {
        const wait = Math.pow(2, i) * 1000 + Math.random() * 500;
        console.warn(
          `[remoteok] 429 from ${url}, backing off ${Math.round(wait)}ms`,
        );
        await sleep(wait);
        continue;
      }
      return resp;
    } catch (err) {
      if (i === retries - 1) {
        console.warn(
          `[remoteok] Failed after ${retries} retries: ${url} — ${err.message}`,
        );
        return null;
      }
      await sleep(Math.pow(2, i) * 500);
    }
  }
  return null;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

function scorePost(post) {
  let score = 30;

  const title = (post.title || "").toLowerCase();
  const body = (post.selftext || "").toLowerCase();
  const combined = title + " " + body;

  if (post.compensation || /\$[\d,]+/.test(combined)) score += 15;
  if (/\b(budget|pay|rate|salary|compensation)\b/.test(combined)) score += 8;
  if (/\b(freelance|contract|part[- ]?time|remote)\b/.test(combined))
    score += 10;
  if (/\b(asap|urgent|immediately|start now)\b/.test(combined)) score += 8;
  if (title.length > 40) score += 5;
  if (body.length > 100) score += 5;
  if (post.company && post.company !== "unknown") score += 5;

  return Math.min(score, 100);
}

function preScoreRemoteOKJob(job) {
  let boost = 0;

  if (job.compensation && job.compensation.length > 0) boost += 30;

  if (job._raw_tags && job._raw_tags.length >= 3) boost += 20;

  const hoursOld = (Date.now() / 1000 - (job.created_utc || 0)) / 3600;
  if (hoursOld <= 48) boost += 15;

  if (job.company && job.company.length > 0 && job.company !== "RemoteOK")
    boost += 10;

  if (job.location && job.location.toLowerCase().includes("remote"))
    boost += 10;

  job._remoteok_boost = boost;
  job.score = Math.min(100, (job.score || 30) + boost);

  if (boost >= 55) job.is_gold = true;

  return job;
}

// ── RemoteOK JSON API ────────────────────────────────────────────────────────

const REMOTEOK_API_URL = "https://remoteok.com/api";

// Tags organized by niche — each tag maps to its niche for reporting
const TAG_NICHES = {
  // ── Design & Creative ─────────────────────────────────────────────────────
  "graphic-design": "Design",
  "graphic-designer": "Design",
  "logo-design": "Design",
  "brand-design": "Design",
  branding: "Design",
  illustration: "Design",
  illustrator: "Design",
  "motion-graphics": "Design",
  "motion-design": "Design",
  animation: "Design",
  animator: "Design",
  "3d": "Design",
  "3d-artist": "Design",
  blender: "Design",
  figma: "Design",
  photoshop: "Design",
  canva: "Design",
  thumbnail: "Design",
  banner: "Design",
  poster: "Design",
  flyer: "Design",
  infographic: "Design",
  ui: "Design",
  ux: "Design",
  "ui-ux": "Design",
  "product-design": "Design",
  "web-design": "Design",
  "creative-director": "Design",
  "art-director": "Design",
  "visual-design": "Design",
  design: "Design",
  designer: "Design",

  // ── Video & Content ───────────────────────────────────────────────────────
  video: "Video & Content",
  "video-editing": "Video & Content",
  "video-editor": "Video & Content",
  youtube: "Video & Content",
  "youtube-editor": "Video & Content",
  tiktok: "Video & Content",
  "tiktok-editor": "Video & Content",
  reels: "Video & Content",
  "short-form-video": "Video & Content",
  "podcast-editing": "Video & Content",
  "content-creation": "Video & Content",
  "content-creator": "Video & Content",
  ugc: "Video & Content",
  "user-generated-content": "Video & Content",
  videography: "Video & Content",
  cinematography: "Video & Content",
  screenwriting: "Video & Content",
  storytelling: "Video & Content",

  // ── Writing & Copy ────────────────────────────────────────────────────────
  copywriting: "Writing",
  copywriter: "Writing",
  "content-writing": "Writing",
  "content-writer": "Writing",
  blog: "Writing",
  blogging: "Writing",
  ghostwriting: "Writing",
  ghostwriter: "Writing",
  "technical-writing": "Writing",
  "technical-writer": "Writing",
  "seo-writing": "Writing",
  "article-writing": "Writing",
  "email-copywriting": "Writing",
  "sales-copy": "Writing",
  "landing-page-copy": "Writing",
  scriptwriting: "Writing",
  proofreading: "Writing",
  editing: "Writing",
  "resume-writing": "Writing",
  writing: "Writing",
  writer: "Writing",
  content: "Writing",
  editor: "Writing",

  // ── Marketing & Social Media ──────────────────────────────────────────────
  "social-media": "Marketing",
  "social-media-manager": "Marketing",
  "social-media-marketing": "Marketing",
  instagram: "Marketing",
  facebook: "Marketing",
  twitter: "Marketing",
  linkedin: "Marketing",
  "tiktok-marketing": "Marketing",
  "community-management": "Marketing",
  "community-manager": "Marketing",
  "email-marketing": "Marketing",
  "email-marketing-specialist": "Marketing",
  seo: "Marketing",
  "seo-specialist": "Marketing",
  "google-ads": "Marketing",
  "facebook-ads": "Marketing",
  ppc: "Marketing",
  "paid-ads": "Marketing",
  "digital-marketing": "Marketing",
  "digital-marketer": "Marketing",
  "growth-hacking": "Marketing",
  growth: "Marketing",
  "influencer-marketing": "Marketing",
  "affiliate-marketing": "Marketing",
  "brand-strategy": "Marketing",
  marketing: "Marketing",
  ads: "Marketing",
  affiliate: "Marketing",

  // ── Development & Tech ────────────────────────────────────────────────────
  "web-development": "Development",
  "web-developer": "Development",
  frontend: "Development",
  "frontend-developer": "Development",
  "front-end": "Development",
  backend: "Development",
  "backend-developer": "Development",
  "back-end": "Development",
  "full-stack": "Development",
  fullstack: "Development",
  javascript: "Development",
  react: "Development",
  reactjs: "Development",
  nextjs: "Development",
  vue: "Development",
  angular: "Development",
  nodejs: "Development",
  node: "Development",
  python: "Development",
  django: "Development",
  flask: "Development",
  php: "Development",
  laravel: "Development",
  wordpress: "Development",
  shopify: "Development",
  webflow: "Development",
  wix: "Development",
  ruby: "Development",
  rails: "Development",
  java: "Development",
  kotlin: "Development",
  swift: "Development",
  ios: "Development",
  android: "Development",
  flutter: "Development",
  mobile: "Development",
  "mobile-app": "Development",
  "react-native": "Development",
  devops: "Development",
  aws: "Development",
  cloud: "Development",
  docker: "Development",
  kubernetes: "Development",
  blockchain: "Development",
  web3: "Development",
  solidity: "Development",
  "smart-contracts": "Development",
  crypto: "Development",
  defi: "Development",
  nft: "Development",
  "machine-learning": "Development",
  ai: "Development",
  "artificial-intelligence": "Development",
  "data-science": "Development",
  "data-scientist": "Development",
  "data-analyst": "Development",
  "data-engineer": "Development",
  automation: "Development",
  chatbot: "Development",
  llm: "Development",
  gpt: "Development",
  "prompt-engineering": "Development",
  "no-code": "Development",
  nocode: "Development",
  bubble: "Development",
  zapier: "Development",
  n8n: "Development",
  airtable: "Development",
  "game-dev": "Development",
  "game-developer": "Development",
  unity: "Development",
  unreal: "Development",
  godot: "Development",
  cybersecurity: "Development",
  security: "Development",
  infosec: "Development",
  sql: "Development",
  database: "Development",
  postgresql: "Development",
  mongodb: "Development",
  dev: "Development",
  developer: "Development",
  software: "Development",
  engineer: "Development",
  engineering: "Development",
  web: "Development",
  data: "Development",
  embedded: "Development",
  serverless: "Development",
  api: "Development",
  nosql: "Development",
  qa: "Development",
  testing: "Development",
  sysadmin: "Development",
  golang: "Development",
  go: "Development",
  rust: "Development",
  game: "Development",
  gaming: "Development",

  // ── Specialized Tech — Fintech/Quant ──────────────────────────────────────
  quant: "Fintech",
  quantitative: "Fintech",
  "algorithmic-trading": "Fintech",
  "algo-trading": "Fintech",
  "trading-infrastructure": "Fintech",
  fintech: "Fintech",
  hft: "Fintech",
  "high-frequency-trading": "Fintech",
  "trading-systems": "Fintech",
  "quant-developer": "Fintech",
  "quantitative-developer": "Fintech",
  "trading-bot": "Fintech",
  "crypto-trading": "Fintech",
  "defi-developer": "Fintech",

  // ── Business & Admin ──────────────────────────────────────────────────────
  "virtual-assistant": "Business & Admin",
  va: "Business & Admin",
  "data-entry": "Business & Admin",
  "project-management": "Business & Admin",
  "project-manager": "Business & Admin",
  "customer-support": "Business & Admin",
  "customer-service": "Business & Admin",
  "executive-assistant": "Business & Admin",
  bookkeeping: "Business & Admin",
  bookkeeper: "Business & Admin",
  accounting: "Business & Admin",
  accountant: "Business & Admin",
  operations: "Business & Admin",
  "business-operations": "Business & Admin",
  research: "Business & Admin",
  "market-research": "Business & Admin",
  hr: "Business & Admin",
  recruiting: "Business & Admin",
  recruitment: "Business & Admin",
  "talent-acquisition": "Business & Admin",
  consulting: "Business & Admin",
  support: "Business & Admin",
  product: "Business & Admin",
  finance: "Business & Admin",
  education: "Business & Admin",
  training: "Business & Admin",
  legal: "Business & Admin",
  medical: "Business & Admin",
  healthcare: "Business & Admin",
  analyst: "Business & Admin",
  analytics: "Business & Admin",
  saas: "Business & Admin",

  // ── Sales ─────────────────────────────────────────────────────────────────
  sales: "Sales",
  "sales-rep": "Sales",
  "lead-generation": "Sales",
  leads: "Sales",
  "cold-calling": "Sales",
  "appointment-setting": "Sales",
  outreach: "Sales",
  "business-development": "Sales",
  crm: "Sales",
  "account-management": "Sales",

  // ── Audio & Music ─────────────────────────────────────────────────────────
  "music-production": "Audio & Music",
  "music-producer": "Audio & Music",
  "audio-engineering": "Audio & Music",
  "audio-engineer": "Audio & Music",
  "sound-design": "Audio & Music",
  "sound-designer": "Audio & Music",
  mixing: "Audio & Music",
  mastering: "Audio & Music",
  voiceover: "Audio & Music",
  "voice-over": "Audio & Music",
  "voice-acting": "Audio & Music",
  "podcast-production": "Audio & Music",
  jingle: "Audio & Music",
  voice: "Audio & Music",
  audio: "Audio & Music",
  podcast: "Audio & Music",
  music: "Audio & Music",

  // ── Photography ───────────────────────────────────────────────────────────
  photography: "Photography",
  photographer: "Photography",
  "photo-editing": "Photography",
  "photo-editor": "Photography",
  retouching: "Photography",
  lightroom: "Photography",
  "product-photography": "Photography",
  headshots: "Photography",
  portrait: "Photography",

  // ── Translation & Language ────────────────────────────────────────────────
  translation: "Translation",
  translator: "Translation",
  localization: "Translation",
  transcription: "Translation",
  transcriptionist: "Translation",
  subtitles: "Translation",
  captions: "Translation",
  interpretation: "Translation",
  multilingual: "Translation",

  // ── 3D & CAD ──────────────────────────────────────────────────────────────
  "3d-modeling": "3D & CAD",
  maya: "3D & CAD",
  cinema4d: "3D & CAD",
  cad: "3D & CAD",
  autocad: "3D & CAD",
  solidworks: "3D & CAD",
  "architectural-visualization": "3D & CAD",
  "product-rendering": "3D & CAD",

  // ── E-commerce ────────────────────────────────────────────────────────────
  ecommerce: "E-commerce",
  "e-commerce": "E-commerce",
  woocommerce: "E-commerce",
  amazon: "E-commerce",
  fba: "E-commerce",
  etsy: "E-commerce",
  dropshipping: "E-commerce",
  "product-listing": "E-commerce",
  "amazon-seller": "E-commerce",
  ebay: "E-commerce",
};

const ALL_TAGS = Object.keys(TAG_NICHES);

const PERMANENT_REJECTION_PATTERNS = [
  /\bfull[- ]?time employee\b/i,
  /\bpermanent position\b/i,
  /\bbenefits package\b/i,
  /\bhealth insurance\b/i,
  /\b401\(?k\)?\b/i,
  /\bequity\b/i,
  /\bstock options?\b/i,
  /\bvesting\b/i,
  /\bPTO\b/,
  /\bdental\b.*\bvision\b/i,
];

function isContractRole(title, body) {
  const combined = (title + " " + body).toLowerCase();

  for (const rx of PERMANENT_REJECTION_PATTERNS) {
    if (rx.test(combined)) return false;
  }

  return true;
}

// ── Niche classification for reporting ──────────────────────────────────────

function classifyNiche(post) {
  const title = (post.title || "").toLowerCase();
  const body = (post.selftext || "").toLowerCase();
  const tags = (post._raw_tags || []).map((t) => t.toLowerCase());
  const combined = title + " " + body + " " + tags.join(" ");

  // Check tags first for precise niche match
  for (const tag of tags) {
    if (TAG_NICHES[tag]) return TAG_NICHES[tag];
  }

  // Fallback: keyword detection
  if (/\b(design|figma|ui|ux|graphic|illustrat|logo|brand)\b/.test(combined))
    return "Design";
  if (/\b(video|youtube|tiktok|reels|cinemat|ugc)\b/.test(combined))
    return "Video & Content";
  if (
    /\b(writ|copy|blog|ghost|proofread|editor|editing|content writ)\b/.test(
      combined,
    )
  )
    return "Writing";
  if (
    /\b(market|seo|social media|ads|ppc|growth|influencer|affiliate)\b/.test(
      combined,
    )
  )
    return "Marketing";
  if (
    /\b(develop|engineer|software|react|python|javascript|code|devops|backend|frontend|full.?stack)\b/.test(
      combined,
    )
  )
    return "Development";
  if (/\b(quant|fintech|trading|algo|hft)\b/.test(combined)) return "Fintech";
  if (
    /\b(virtual assistant|data entry|bookkeep|account|admin|project manage|customer support)\b/.test(
      combined,
    )
  )
    return "Business & Admin";
  if (/\b(sales|lead gen|cold call|outreach|crm)\b/.test(combined))
    return "Sales";
  if (/\b(audio|music|sound|voiceover|voice|podcast|mixing|master)\b/.test(combined))
    return "Audio & Music";
  if (/\b(photo|lightroom|retouch|headshot|portrait)\b/.test(combined))
    return "Photography";
  if (/\b(translat|locali|transcri|subtitle|caption|multilingual)\b/.test(combined))
    return "Translation";
  if (/\b(3d model|cad|autocad|solidworks|maya|cinema4d|render)\b/.test(combined))
    return "3D & CAD";
  if (/\b(ecommerce|shopify|woocommerce|amazon|etsy|dropship|ebay)\b/.test(combined))
    return "E-commerce";

  return "Other";
}

// ── Metrics tracking ─────────────────────────────────────────────────────────

const metrics = {
  totalFetched: 0,
  rejectedAge: 0,
  rejectedContract: 0,
  rejectedAI: 0,
  finalCount: 0,
  goldLeads: 0,
  niches: new Set(),
  nicheCounts: {},
  oldestHoursAgo: 0,
};

async function fetchRemoteOK() {
  const seen = new Set();
  const allPosts = [];
  const nowSec = Math.floor(Date.now() / 1000);
  let rawTotal = 0;

  function parseJobs(jobs) {
    const posts = [];
    for (const j of jobs) {
      const title = stripHtml(j.position || j.title || "");
      const link = j.url || j.apply_url || "";
      if (!title || !link) continue;

      rawTotal++;

      const id = j.id
        ? `remoteok_${j.id}`
        : `remoteok_${link.replace(/[^a-z0-9]/gi, "_").slice(-60)}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const createdUtc = j.epoch
        ? Number(j.epoch)
        : j.date
          ? Math.floor(new Date(j.date).getTime() / 1000)
          : nowSec;

      if (nowSec - createdUtc > MAX_AGE_SEC) {
        metrics.rejectedAge++;
        continue;
      }

      const rawDesc = stripHtml(j.description || "");
      const rawTags = Array.isArray(j.tags) ? j.tags : [];
      const tagsStr = rawTags.join(", ");
      const fullDesc = tagsStr ? `${rawDesc}\n\nTags: ${tagsStr}` : rawDesc;

      if (!isContractRole(title, fullDesc)) {
        metrics.rejectedContract++;
        continue;
      }

      for (const tag of rawTags) {
        metrics.niches.add(tag.toLowerCase());
      }

      let compensation = null;
      if (j.salary_min > 0 || j.salary_max > 0) {
        const fmt = (n) => `$${Number(n).toLocaleString("en-US")}`;
        compensation =
          j.salary_min > 0 && j.salary_max > 0
            ? `${fmt(j.salary_min)}-${fmt(j.salary_max)}`
            : j.salary_max > 0
              ? `Up to ${fmt(j.salary_max)}`
              : fmt(j.salary_min);
      }

      posts.push({
        id,
        name: id,
        title,
        selftext: fullDesc.slice(0, 4000),
        author: j.company || "RemoteOK",
        author_name: j.company || "RemoteOK",
        permalink: link,
        subreddit: null,
        created_utc: createdUtc,
        num_comments: 0,
        ups: 0,
        link_flair_text: "RemoteOK",
        compensation,
        company: j.company || null,
        employment_type: "contract",
        location: j.location || "Remote",
        _sub: "remoteok",
        source: "remoteok",
        source_platform: "RemoteOK",
        _raw_tags: rawTags,
      });
    }
    return posts;
  }

  // Step 1: Fetch main /api
  try {
    const resp = await fetchWithRetry(REMOTEOK_API_URL, {
      headers: { Accept: "application/json" },
    });
    if (resp && resp.ok) {
      const data = await resp.json();
      const jobs = Array.isArray(data) ? data.slice(1) : [];
      const posts = parseJobs(jobs);
      allPosts.push(...posts);
      console.log(`[remoteok] /api: ${posts.length} kept (${jobs.length} raw)`);
    }
  } catch (err) {
    console.warn(`[remoteok] /api error: ${err.message}`);
  }

  // Step 2: Fetch all tags in parallel batches of 10
  let tagTotal = 0;
  let tagErrors = 0;
  const totalBatches = Math.ceil(ALL_TAGS.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const batch = ALL_TAGS.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (tag) => {
        try {
          const resp = await fetchWithRetry(
            `${REMOTEOK_API_URL}?tag=${encodeURIComponent(tag)}`,
            { headers: { Accept: "application/json" } },
          );
          if (!resp || !resp.ok) {
            tagErrors++;
            return [];
          }
          const data = await resp.json();
          const jobs = Array.isArray(data) ? data.slice(1) : [];
          return parseJobs(jobs);
        } catch {
          tagErrors++;
          return [];
        }
      }),
    );

    for (const posts of results) {
      allPosts.push(...posts);
      if (posts.length > 0) tagTotal += posts.length;
    }

    const done = Math.min((b + 1) * BATCH_SIZE, ALL_TAGS.length);
    if (done % 50 === 0 || b === totalBatches - 1) {
      console.log(
        `[remoteok] Tags: ${done}/${ALL_TAGS.length} done (${allPosts.length} unique so far)`,
      );
    }

    if (b < totalBatches - 1) await sleep(BATCH_DELAY_MS);
  }

  console.log(
    `[remoteok] Tag searches: ${tagTotal} new from ${ALL_TAGS.length} tags (${tagErrors} errors)`,
  );
  console.log(`[remoteok] Total: ${allPosts.length} unique posts`);

  metrics.totalFetched = rawTotal;
  return allPosts;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[remoteok] Starting RemoteOK scan...");
  console.log(`[remoteok] ${ALL_TAGS.length} tags across 12 niches`);

  const seenIds = await redisSmembers(SEEN_KEY);
  console.log(`[remoteok] ${seenIds.size} previously seen post IDs loaded`);

  const allPosts = await fetchRemoteOK();
  console.log(
    `[remoteok] Raw posts after freshness+contract filter: ${allPosts.length}`,
  );

  // Dedup by ID
  const seenDedup = new Set();
  const unique = [];
  for (const p of allPosts) {
    if (!seenDedup.has(p.id)) {
      seenDedup.add(p.id);
      unique.push(p);
    }
  }
  console.log(`[remoteok] After dedup: ${unique.length}`);

  // Filter out already-classified posts
  const newPosts = unique.filter((p) => !seenIds.has(p.id));
  const existingPosts = unique.filter((p) => seenIds.has(p.id));
  console.log(
    `[remoteok] New posts to classify: ${newPosts.length}, already seen: ${existingPosts.length}`,
  );

  // AI classification
  let classifiedNew = newPosts;
  if (newPosts.length > 0) {
    classifiedNew = await classifyAndFilter(newPosts);
    metrics.rejectedAI = newPosts.length - classifiedNew.length;
    console.log(
      `[remoteok] After AI filter: ${classifiedNew.length} real gigs from ${newPosts.length} new posts`,
    );
  }

  // Mark new posts as seen
  const newIds = newPosts.map((p) => p.id);
  if (newIds.length > 0) {
    await redisSadd(SEEN_KEY, newIds, SEEN_TTL);
  }

  // Merge with existing data from Redis
  let existingData = [];
  const cached = await redisGet(REDIS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      existingData = parsed.posts || [];
    } catch {
      /* ignore */
    }
  }

  // Re-classify if cache expired but seen-set still active
  if (
    classifiedNew.length === 0 &&
    existingData.length === 0 &&
    unique.length > 0
  ) {
    console.log(
      `[remoteok] Cache expired but seen-set active — re-classifying ${unique.length} posts`,
    );
    classifiedNew = await classifyAndFilter(unique);
    metrics.rejectedAI = unique.length - classifiedNew.length;
    console.log(
      `[remoteok] Re-classification: ${classifiedNew.length} real gigs from ${unique.length} posts`,
    );
  }

  // Combine: new classified + existing cached
  const mergedMap = new Map();
  for (const p of existingData) mergedMap.set(p.id, p);
  for (const p of classifiedNew) {
    p.score = scorePost(p);
    preScoreRemoteOKJob(p);
    mergedMap.set(p.id, p);
  }

  // Drop posts older than 48 hours
  const nowSec = Math.floor(Date.now() / 1000);
  let final = [...mergedMap.values()].filter(
    (p) => !p.created_utc || nowSec - p.created_utc < MAX_AGE_SEC,
  );

  // Sort newest first, cap at MAX_POSTS
  final.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));
  final = final.slice(0, MAX_POSTS);

  metrics.finalCount = final.length;
  metrics.goldLeads = final.filter((p) => p.is_gold).length;

  // Classify each post into a niche for reporting
  for (const p of final) {
    const niche = classifyNiche(p);
    p._niche = niche;
    metrics.nicheCounts[niche] = (metrics.nicheCounts[niche] || 0) + 1;
  }

  // Find oldest job in results
  if (final.length > 0) {
    const oldest = final[final.length - 1];
    metrics.oldestHoursAgo = oldest.created_utc
      ? ((nowSec - oldest.created_utc) / 3600).toFixed(1)
      : 0;
  }

  // Store in Redis
  const payload = JSON.stringify({
    posts: final,
    cached_at: new Date().toISOString(),
    post_count: final.length,
    feed: "remoteok",
    sources: {
      remoteok: final.length,
    },
  });

  await redisSet(REDIS_KEY, payload, REDIS_TTL);
  console.log(
    `[remoteok] Stored ${final.length} posts in Redis (TTL: ${REDIS_TTL}s)`,
  );

  // ── Terminal report ──────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  RemoteOK Fetch Results");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Total jobs fetched:           ${metrics.totalFetched}`);
  console.log(`  Rejected — older than 48h:    ${metrics.rejectedAge}`);
  console.log(`  Rejected — not freelance:     ${metrics.rejectedContract}`);
  console.log(`  Rejected — AI filter:         ${metrics.rejectedAI}`);
  console.log(`  Final jobs in Redis:          ${metrics.finalCount}`);
  console.log(`  Gold Leads:                   ${metrics.goldLeads}`);
  console.log(`  Niches covered:               ${metrics.niches.size}`);
  console.log(
    `  Oldest job in results:        ${metrics.oldestHoursAgo} hours ago`,
  );
  console.log("════════════════════════════════════════════════════════════\n");

  // Niche breakdown table
  const allNicheNames = [
    "Development",
    "Design",
    "Video & Content",
    "Writing",
    "Marketing",
    "Business & Admin",
    "Sales",
    "Audio & Music",
    "Photography",
    "Translation",
    "Fintech",
    "3D & CAD",
    "E-commerce",
    "Other",
  ];
  console.log("  Niche Breakdown:");
  console.log("  ─────────────────────────────────────");
  let totalNiche = 0;
  for (const niche of allNicheNames) {
    const count = metrics.nicheCounts[niche] || 0;
    totalNiche += count;
    const pad = niche.padEnd(22);
    console.log(`  ${pad} ${count}`);
  }
  console.log("  ─────────────────────────────────────");
  console.log(`  ${"Total".padEnd(22)} ${totalNiche}`);
  console.log("");

  // Show 10 sample jobs
  const samples = final.slice(0, 10);
  if (samples.length > 0) {
    console.log("Sample Jobs (up to 10):");
    console.log("─".repeat(80));
    for (const s of samples) {
      const hoursAgo = s.created_utc
        ? ((nowSec - s.created_utc) / 3600).toFixed(1)
        : "?";
      const tags = (s._raw_tags || []).slice(0, 5).join(", ");
      console.log(`  Title:    ${s.title}`);
      console.log(`  Company:  ${s.company || "N/A"}`);
      console.log(`  Niche:    ${s._niche || "Unknown"}`);
      console.log(`  Posted:   ${hoursAgo}h ago`);
      console.log(`  Salary:   ${s.compensation || "N/A"}`);
      console.log(`  Tags:     ${tags || "N/A"}`);
      console.log(
        `  Score:    ${s.score}  |  Gold: ${s.is_gold ? "YES" : "no"}`,
      );
      console.log("─".repeat(80));
    }
  } else {
    console.log("No fresh jobs found within 48 hours.");
  }
}

main().catch((err) => {
  console.error("[remoteok] Fatal error:", err);
  process.exit(1);
});
