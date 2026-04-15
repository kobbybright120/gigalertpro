/**
 * GigAlertPro — Scanner Quality Test Harness
 *
 * Fetches raw posts from the production API, runs matchAndScore for each
 * keyword, and prints a detailed relevance report.
 *
 * Usage:  node scripts/test-scanner.mjs
 */

// ── Polyfill browser APIs for Node ──────────────────────────────────────────
globalThis.localStorage = {
  _data: {},
  getItem(k) {
    return this._data[k] ?? null;
  },
  setItem(k, v) {
    this._data[k] = v;
  },
  removeItem(k) {
    delete this._data[k];
  },
};

// Polyfill import.meta.env for Vite
if (!import.meta.env) {
  Object.defineProperty(import.meta, "env", {
    value: { PROD: true },
    writable: true,
  });
}

const BASE_URL = "https://gigalertpro.com";

// ── Fetch raw posts from production ─────────────────────────────────────────
async function fetchRawPosts() {
  console.log("Fetching raw posts from production API...\n");

  const [redditResp, xResp] = await Promise.all([
    fetch(`${BASE_URL}/api/scan-reddit`, {
      headers: { Accept: "application/json" },
    }),
    fetch(`${BASE_URL}/api/x-feed`, {
      headers: { Accept: "application/json" },
    }),
  ]);

  if (!redditResp.ok)
    throw new Error(`scan-reddit returned ${redditResp.status}`);
  if (!xResp.ok) throw new Error(`x-feed returned ${xResp.status}`);

  const redditJson = await redditResp.json();
  const xJson = await xResp.json();

  const redditPosts = (redditJson.posts || []).map((p) => ({
    ...p,
    _weight: 1.0,
    _source_platform: "Reddit",
  }));

  const communityPosts = (xJson.posts || []).map((p) => ({
    ...p,
    _weight: 1.0,
    _source_platform:
      p._sub === "craigslist"
        ? "Craigslist"
        : p._sub === "nitter"
          ? "X"
          : p._sub === "threads"
            ? "Threads"
            : "Community",
  }));

  const allPosts = [...redditPosts, ...communityPosts];
  console.log(
    `Total raw posts: ${allPosts.length} (Reddit: ${redditPosts.length}, Community: ${communityPosts.length})\n`,
  );
  return allPosts;
}

// ── Import the scanner ──────────────────────────────────────────────────────
const { _testMatchAndScore } = await import("../src/lib/redditClient.js");

// ── Keywords to test ────────────────────────────────────────────────────────
const KEYWORDS = [
  // ── Design ──
  "graphic designer",
  "logo design",
  "ui ux designer",
  "web designer",
  "brand designer",
  "motion graphics",
  "illustrator",
  "3d artist",
  "thumbnail designer",
  "banner designer",

  // ── Development ──
  "web developer",
  "react developer",
  "wordpress developer",
  "full stack developer",
  "python developer",
  "node.js developer",
  "shopify developer",
  "php developer",
  "android developer",
  "ios developer",
  "flutter developer",
  "mobile app developer",
  "devops engineer",
  "blockchain developer",
  "game developer",

  // ── Writing & Content ──
  "copywriter",
  "content writer",
  "ghostwriter",
  "technical writer",
  "blog writer",
  "seo writer",
  "proofreader",
  "scriptwriter",

  // ── Marketing ──
  "social media manager",
  "seo specialist",
  "email marketing",
  "google ads specialist",
  "facebook ads",
  "digital marketing",
  "lead generation",
  "community manager",
  "affiliate marketing",

  // ── Video & Audio ──
  "video editor",
  "youtube editor",
  "podcast editor",
  "voice over",
  "voice actor",
  "animator",
  "sound designer",
  "audio engineer",

  // ── Business & Admin ──
  "virtual assistant",
  "data entry",
  "executive assistant",
  "bookkeeper",
  "customer service",
  "project manager",
  "operations manager",

  // ── Sales ──
  "sales representative",
  "appointment setter",
  "cold caller",
  "account manager",
  "business development",

  // ── Data & AI ──
  "data scientist",
  "data analyst",
  "machine learning engineer",
  "ai engineer",
  "prompt engineer",
  "web scraper",

  // ── Photography ──
  "photographer",
  "photo editor",
  "retouching",

  // ── Translation ──
  "translator",
  "transcriptionist",

  // ── Specialized / Ecommerce ──
  "ugc creator",
  "amazon seller",
  "tiktok marketing",
  "dropshipping",

  // ── Creative ──
  "music producer",
  "3d animator",
  "concept artist",
  "comic artist",
];
const allPosts = await fetchRawPosts();
const summaryRows = [];

for (const kw of KEYWORDS) {
  console.log("═".repeat(80));
  console.log(`KEYWORD: "${kw}"`);
  console.log("═".repeat(80));

  const results = _testMatchAndScore(allPosts, [kw.toLowerCase()]);
  const total = results.length;

  if (total === 0) {
    console.log("  → No results\n");
    summaryRows.push({ kw, total: 0, relevant: 0, pct: "0%" });
    continue;
  }

  // Show top 10
  const top10 = results.slice(0, 10);
  let relevant = 0;
  let flagged = 0;

  for (let i = 0; i < top10.length; i++) {
    const g = top10[i];
    const issues = [];

    // Flag detection
    if (g._is_full_time_job) issues.push("FULL-TIME-JOB");
    if (g.score < 30) issues.push("LOW-SCORE");
    if (!g.budget && g.score < 50) issues.push("NO-BUDGET+LOW-SCORE");

    // Check if title is actually relevant to the keyword
    const titleLower = g.title.toLowerCase();
    const kwWords = kw.toLowerCase().split(" ");
    const titleHasKw = kwWords.some((w) => titleLower.includes(w));
    if (!titleHasKw && g.score < 60) issues.push("KEYWORD-NOT-IN-TITLE");

    // Multi-role detection
    const rolePatterns = [
      /virtual assistant/i,
      /data entry/i,
      /social media/i,
      /graphic design/i,
      /video edit/i,
      /web develop/i,
      /customer (support|service)/i,
      /content writ/i,
      /copywrite/i,
      /SEO/i,
      /project manage/i,
      /photo/i,
      /translat/i,
    ];
    const bodyText = g.title + " " + (g.body_preview || "");
    const roleMatches = rolePatterns.filter((rx) => rx.test(bodyText)).length;
    if (roleMatches >= 4) issues.push(`MULTI-ROLE(${roleMatches})`);

    // Scam detection
    if (/copy\s+(?:and|&)\s+paste/i.test(bodyText))
      issues.push("SCAM-COPYPASTE");
    if (
      /no\s+experience\s+(?:needed|required)/i.test(bodyText) &&
      /\$\s*\d{2,}/i.test(bodyText)
    )
      issues.push("SCAM-NOSKILL+HIGHPAY");
    if (/\brepost(?:ing)?\s+work\b/i.test(bodyText)) issues.push("SCAM-REPOST");

    // Physical job detection
    if (
      /\b(plumber|electrician|cashier|barista|driver|warehouse|tour guide|merchandiser|landscap|handym)/i.test(
        bodyText,
      )
    )
      issues.push("PHYSICAL-JOB");

    const isRelevant = issues.length === 0;
    if (isRelevant) relevant++;
    else flagged++;

    const status = isRelevant ? "✅" : "❌";
    const issueStr = issues.length > 0 ? ` [${issues.join(", ")}]` : "";

    console.log(`\n  ${i + 1}. ${status} ${g.title.slice(0, 80)}${issueStr}`);
    console.log(
      `     Source: ${g.source_platform} | Score: ${g.score} | Gold: ${g.is_gold ? "⭐" + g.quality_score : "No"} | Budget: ${g.budget || "None"}`,
    );
    console.log(`     Category: ${g.category} | FTJ: ${g._is_full_time_job}`);
    if (g.body_preview) {
      console.log(`     Body: ${g.body_preview.slice(0, 120)}...`);
    }
  }

  // Count all results (not just top 10)
  let totalRelevant = 0;
  for (const g of results) {
    const bodyText = g.title + " " + (g.body_preview || "");
    const issues = [];
    if (g._is_full_time_job) issues.push("FTJ");
    if (g.score < 30) issues.push("LOW");
    const roleMatches = [
      /virtual assistant/i,
      /data entry/i,
      /social media/i,
      /graphic design/i,
      /video edit/i,
      /web develop/i,
      /customer (support|service)/i,
      /content writ/i,
      /copywrite/i,
      /SEO/i,
      /project manage/i,
      /photo/i,
      /translat/i,
    ].filter((rx) => rx.test(bodyText)).length;
    if (roleMatches >= 4) issues.push("MULTI");
    if (/copy\s+(?:and|&)\s+paste/i.test(bodyText)) issues.push("SCAM");
    if (/\brepost(?:ing)?\s+work\b/i.test(bodyText)) issues.push("SCAM");
    if (
      /\b(plumber|electrician|cashier|barista|driver|warehouse|tour guide|merchandiser|landscap|handym)/i.test(
        bodyText,
      )
    )
      issues.push("PHYS");
    if (
      /no\s+experience\s+(?:needed|required)/i.test(bodyText) &&
      /\$\s*\d{2,}/i.test(bodyText)
    )
      issues.push("SCAM");
    if (issues.length === 0) totalRelevant++;
  }

  const pct = total > 0 ? Math.round((totalRelevant / total) * 100) : 0;
  console.log(
    `\n  SUMMARY: ${total} total, ${totalRelevant} relevant (${pct}%), ${total - totalRelevant} flagged`,
  );
  summaryRows.push({ kw, total, relevant: totalRelevant, pct: `${pct}%` });
}

// ── Final Summary Table ─────────────────────────────────────────────────────
console.log("\n\n" + "═".repeat(80));
console.log("FINAL SUMMARY — ALL KEYWORDS");
console.log("═".repeat(80));
console.log(
  "Keyword".padEnd(25) +
    "Total".padStart(8) +
    "Relevant".padStart(10) +
    "Pct".padStart(8),
);
console.log("─".repeat(51));
let grandTotal = 0;
let grandRelevant = 0;
for (const r of summaryRows) {
  console.log(
    r.kw.padEnd(25) +
      String(r.total).padStart(8) +
      String(r.relevant).padStart(10) +
      r.pct.padStart(8),
  );
  grandTotal += r.total;
  grandRelevant += r.relevant;
}
console.log("─".repeat(51));
const grandPct =
  grandTotal > 0 ? Math.round((grandRelevant / grandTotal) * 100) : 0;
console.log(
  "OVERALL".padEnd(25) +
    String(grandTotal).padStart(8) +
    String(grandRelevant).padStart(10) +
    `${grandPct}%`.padStart(8),
);
console.log("\n");
