// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Gold Lead Qualification Engine
//
// Scores scraped gig posts on a 0-100 scale based on four pillars:
//   1. Primary Intent  (0-40 pts) — Is the post *primarily* about the keyword?
//   2. Budget Clarity   (0-40 pts) — Is there a real budget/rate mentioned?
//   3. Specific Scope   (0-20 pts) — Does the poster describe a concrete project?
//   4. Source Authority  (0-10 pts) — Professional signals (email, deadline, URL)?
//
// Posts scoring > 80 are tagged `is_gold: true`.
//
// Usage:
//   import { scoreGoldLead } from "./goldLeadScorer";
//   const enriched = scoreGoldLead(gig, userKeywords);
//   // → { quality_score, is_gold, category, clean_summary, extracted_budget, filter_reason }
// ─────────────────────────────────────────────────────────────────────────────

// ── Budget parsing helpers ───────────────────────────────────────────────────

/** Parse a dollar string like "$500", "$1.5k", "$30/hr" into a numeric value */
function parseDollarAmount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/,/g, "").trim();

  // Hourly: $30/hr → return as-is (caller interprets)
  const hourly = cleaned.match(
    /\$\s?([\d.]+)\s*(?:\/\s*h(?:ou)?r|per\s+h(?:ou)?r)/i,
  );
  if (hourly) return { value: parseFloat(hourly[1]), type: "hourly" };

  // "k" shorthand: $5k → 5000
  const kMatch = cleaned.match(/\$\s?([\d.]+)\s*k/i);
  if (kMatch) return { value: parseFloat(kMatch[1]) * 1000, type: "fixed" };

  // Plain: $500
  const plain = cleaned.match(/\$\s?([\d.]+)/);
  if (plain) return { value: parseFloat(plain[1]), type: "fixed" };

  return { value: 0, type: "unknown" };
}

/** Extract the first usable budget string from text */
function extractBudgetFromText(text) {
  if (!text) return null;
  // Range: $500-$1000
  const range = text.match(
    /\$\s?[\d,]+(?:\.\d{1,2})?(?:k)?\s*[-–—to]+\s*\$?\s?[\d,]+(?:\.\d{1,2})?(?:k)?/i,
  );
  if (range) return range[0].replace(/\s+/g, " ").trim();
  // Hourly: $50/hr
  const hourly = text.match(
    /\$\s?[\d,]+(?:\.\d{1,2})?\s*(?:\/\s*h(?:ou)?r|per\s+h(?:ou)?r)/i,
  );
  if (hourly) return hourly[0].replace(/\s+/g, " ").trim();
  // "k" shorthand
  const kMatch = text.match(/\$\s?[\d,.]+\s*k\b/i);
  if (kMatch) return kMatch[0].replace(/\s+/g, "");
  // Plain dollar
  const plain = text.match(/\$\s?[\d,]+(?:\.\d{1,2})?/);
  return plain ? plain[0].replace(/\s/g, "") : null;
}

// ── Low-budget / unpaid signals ──────────────────────────────────────────────
const LOW_BUDGET_PATTERNS = [
  /\bunpaid\b/i,
  /\bno\s+pay\b/i,
  /\bfree\s+work\b/i,
  /\bfor\s+free\b/i,
  /\bfor\s+exposure\b/i,
  /\blow\s+budget\b/i,
  /\btight\s+budget\b/i,
  /\bshoestring\s+budget\b/i,
  /\bvolunteer\b/i,
  /\brev(?:enue)?\s*share\b/i,
  /\bequity\s+only\b/i,
  /\bno\s+(?:money|budget|funds?)\b/i,
];

// ── Scope / specificity signals ──────────────────────────────────────────────
const SPECIFIC_SCOPE_PATTERNS = [
  // Quantifiable deliverables
  /\b\d+\s*[-–]?\s*(?:page|screen|slide|video|minute|hour|word|article|post|image|logo|banner|email|landing\s*page)s?\b/i,
  // Time-bounded projects
  /\b(?:deadline|due\s+(?:by|date)|deliver(?:y|ed)?\s+(?:by|in|within)|turnaround|timeline)\b/i,
  // Specific tools / technologies mentioned
  /\b(?:figma|photoshop|illustrator|premiere|after\s+effects|wordpress|shopify|react|node|python|django|laravel|flutter|swift|kotlin|unity|blender)\b/i,
  // Detailed project descriptions
  /\b(?:e-?commerce|saas|mobile\s+app|web\s+app|landing\s+page|dashboard|portfolio\s+site|blog|api|plugin|extension|theme|template)\b/i,
  // Industry context
  /\b(?:for\s+(?:my|our|a)\s+(?:startup|company|business|brand|agency|client|restaurant|clinic|salon|gym|store|shop|firm|practice))\b/i,
];

// ── Authority signals ────────────────────────────────────────────────────────
const AUTHORITY_PATTERNS = [
  // Professional email
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/,
  // Company website link
  /\bhttps?:\/\/(?!(?:reddit|twitter|x|threads|instagram|facebook|nitter|imgur|gfycat|youtube|youtu\.be)\.)[\w.-]+\.\w{2,}/i,
  // Deadline mentions
  /\b(?:deadline|due\s+(?:by|date)|asap|urgent|immediately|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|end\s+of\s+(?:week|month|day)|next\s+week|tomorrow|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/i,
  // Job formality signals
  /\b(?:NDA|contract|invoice|milestone|statement\s+of\s+work|SOW|proposal\s+required)\b/i,
];

// ── Role-list penalty detection ──────────────────────────────────────────────
const ROLE_WORDS =
  /\b(?:va|virtual\s*assistant|data\s*entry|customer\s*(?:service|support)|admin|secretary|bookkeep|receptionist|typist|accountant|designer|developer|writer|editor|marketer|seo|social\s*media|video\s*editor|animator|photographer|illustrator|translator|transcription|copywriter|content\s*writer|graphic\s*design|web\s*developer|frontend|backend|full[\s-]?stack|mobile\s*dev|game\s*dev|voice[\s-]?over|podcast|tutor|coach|sales|cold\s*call|lead\s*gen|project\s*manag)\b/gi;

/**
 * Count distinct role mentions in text.
 * Returns the number of unique role-type words found.
 */
function countRoleMentions(text) {
  const matches = text.match(ROLE_WORDS);
  if (!matches) return 0;
  const unique = new Set(matches.map((m) => m.toLowerCase().trim()));
  return unique.size;
}

// ── Category detection (mirrors redditClient.js categories) ──────────────────
const CATEGORY_RULES = [
  {
    label: "Design",
    rx: /\b(?:design|logo|graphic|ui\/?ux|figma|photoshop|illustrat|brand|visual|banner|poster|thumbnail|canva|3d\s?artist|blender)\b/i,
  },
  {
    label: "Development",
    rx: /\b(?:develop|program|software|react|node|python|javascript|typescript|php|ruby|swift|flutter|mobile\s?app|android|ios|api|database|wordpress|shopify|blockchain|solidity|web3|game\s?dev|unity|unreal)\b/i,
  },
  {
    label: "Writing",
    rx: /\b(?:writ|copywriting|content|blog|article|seo\s?writ|ghostwrit|technical\s?writ|edit|proofread|translat|transcript)\b/i,
  },
  {
    label: "Marketing",
    rx: /\b(?:market|seo|social\s?media|ads?\b|advertis|email\s?market|ppc|google\s?ads|facebook\s?ads|growth|funnel|lead\s?gen|influencer|digital\s?market)\b/i,
  },
  {
    label: "Video",
    rx: /\b(?:video|animation|motion\s?graphic|after\s?effects|premiere|youtube|podcast|audio|voice.?over|voice\s?act|narrator|music\s?produc|sound\s?design)\b/i,
  },
];

function detectGoldCategory(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.rx.test(text)) return rule.label;
  }
  return "Other";
}

// ── Summary generator ────────────────────────────────────────────────────────
function generateCleanSummary(title, body) {
  // Use title as base, append body context if it adds info
  let summary = (title || "").replace(/\[.*?\]/g, "").trim();
  if (summary.length < 30 && body) {
    const firstSentence = body.match(/^[^.!?\n]{10,120}[.!?]/);
    if (firstSentence) {
      summary = summary ? `${summary} — ${firstSentence[0]}` : firstSentence[0];
    }
  }
  // Cap length
  if (summary.length > 150) {
    const cut = summary.lastIndexOf(" ", 147);
    summary = summary.slice(0, cut > 80 ? cut : 147) + "…";
  }
  return summary || "Gig opportunity";
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Scoring Function
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Score a gig post for "Gold Lead" quality.
 *
 * @param {Object} gig - The gig object (from matchAndScore pipeline)
 *   Expected fields: title, body_preview, budget, matched_keywords, score,
 *                    category, source_platform, url, author
 * @param {string[]} userKeywords - The user's tracked keywords (lowercase)
 * @returns {Object} Gold lead enrichment:
 *   { quality_score, is_gold, category, clean_summary, extracted_budget, filter_reason }
 */
export function scoreGoldLead(gig, userKeywords = []) {
  const title = (gig.title || "").toLowerCase();
  const body = (gig.body_preview || "").toLowerCase();
  const fullText = title + " " + body;
  const rawText = (gig.title || "") + " " + (gig.body_preview || "");
  const reasons = [];

  let qualityScore = 0;

  // ── 1. PRIMARY INTENT (0-40 pts) ──────────────────────────────────────────
  const kwsLower = (userKeywords || []).map((k) =>
    typeof k === "string" ? k.toLowerCase() : (k.keyword || "").toLowerCase(),
  );

  let intentScore = 0;
  let primaryMatch = false;

  for (const kw of kwsLower) {
    if (!kw) continue;
    // Check title first (strongest signal)
    if (title.includes(kw)) {
      intentScore += 30;
      primaryMatch = true;
      break;
    }
    // Check body (weaker signal)
    if (body.includes(kw)) {
      intentScore += 20;
      primaryMatch = true;
      break;
    }
  }

  // Also check matched_keywords from the existing pipeline
  if (
    !primaryMatch &&
    gig.matched_keywords &&
    gig.matched_keywords.length > 0
  ) {
    intentScore += 15;
    primaryMatch = true;
  }

  // Boost if keyword appears in both title AND body
  if (primaryMatch) {
    const kwInBoth = kwsLower.some(
      (kw) => kw && title.includes(kw) && body.includes(kw),
    );
    if (kwInBoth) intentScore = Math.min(40, intentScore + 10);
  }

  // ── PENALTY: keyword is one item in a long role-list (5+ roles) ──
  const roleCount = countRoleMentions(fullText);
  if (roleCount >= 5) {
    intentScore -= 50;
    reasons.push(`Role-list penalty: ${roleCount} roles mentioned`);
  }

  intentScore = Math.max(-10, Math.min(40, intentScore));
  qualityScore += intentScore;
  if (intentScore >= 25) reasons.push("Strong keyword intent in title");
  else if (intentScore >= 15) reasons.push("Keyword found in body");
  else if (intentScore < 0) reasons.push("Weak intent — drowned in role list");

  // ── 2. BUDGET CLARITY (0-40 pts) ──────────────────────────────────────────
  let budgetScore = 0;
  const budgetStr = gig.budget || extractBudgetFromText(rawText);

  if (budgetStr && /\$\s?\d/.test(budgetStr)) {
    budgetScore += 30;
    reasons.push(`Budget mentioned: ${budgetStr}`);

    // Bonus for high rates
    const parsed = parseDollarAmount(budgetStr);
    if (parsed.type === "hourly" && parsed.value >= 30) {
      budgetScore += 10;
      reasons.push("High hourly rate (≥$30/hr)");
    } else if (parsed.type === "fixed" && parsed.value >= 100) {
      budgetScore += 10;
      reasons.push("High project budget (≥$100)");
    }

    // Penalty for very low budgets
    if (parsed.type === "fixed" && parsed.value > 0 && parsed.value <= 5) {
      budgetScore -= 40;
      reasons.push("Very low budget (≤$5)");
    }
  }

  // Penalty for explicit low-budget / unpaid signals
  if (LOW_BUDGET_PATTERNS.some((rx) => rx.test(fullText))) {
    budgetScore -= 40;
    reasons.push("Low-budget or unpaid signals detected");
  }

  budgetScore = Math.max(-10, Math.min(40, budgetScore));
  qualityScore += budgetScore;

  // ── 3. SPECIFIC SCOPE (0-20 pts) ──────────────────────────────────────────
  let scopeScore = 0;

  const scopeHits = SPECIFIC_SCOPE_PATTERNS.filter((rx) =>
    rx.test(fullText),
  ).length;
  if (scopeHits >= 3) {
    scopeScore = 20;
    reasons.push("Highly specific project scope");
  } else if (scopeHits >= 2) {
    scopeScore = 15;
    reasons.push("Good project specificity");
  } else if (scopeHits >= 1) {
    scopeScore = 10;
    reasons.push("Some project detail provided");
  }

  // Bonus for longer, detailed descriptions (proxy for specificity)
  const bodyLength = (gig.body_preview || "").length;
  if (bodyLength > 200) scopeScore = Math.min(20, scopeScore + 5);
  else if (bodyLength < 30 && scopeScore > 0)
    scopeScore = Math.max(0, scopeScore - 5);

  qualityScore += scopeScore;

  // ── 4. SOURCE AUTHORITY (0-10 pts) ─────────────────────────────────────────
  let authorityScore = 0;

  const authorityHits = AUTHORITY_PATTERNS.filter((rx) =>
    rx.test(rawText),
  ).length;
  if (authorityHits >= 2) {
    authorityScore = 10;
    reasons.push("Strong authority signals (email/link/deadline)");
  } else if (authorityHits >= 1) {
    authorityScore = 5;
    reasons.push("Some authority signal present");
  }

  qualityScore += authorityScore;

  // ── Final clamp ──
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  // ── Build output ──
  const category = gig.category || detectGoldCategory(fullText);
  const extractedBudget = budgetStr || "Not Specified";
  const cleanSummary = generateCleanSummary(gig.title, gig.body_preview);
  const isGold = qualityScore > 80;

  return {
    quality_score: qualityScore,
    is_gold: isGold,
    category,
    clean_summary: cleanSummary,
    extracted_budget: extractedBudget,
    filter_reason: reasons.join("; ") || "No strong quality signals detected",
  };
}

/**
 * Enrich an array of gig results with gold lead scoring.
 *
 * @param {Object[]} gigs - Array of gig objects from the pipeline
 * @param {string[]} userKeywords - User's tracked keywords
 * @returns {Object[]} Same array with gold lead fields merged in
 */
export function enrichWithGoldScores(gigs, userKeywords = []) {
  return gigs.map((gig) => {
    const gold = scoreGoldLead(gig, userKeywords);
    return {
      ...gig,
      quality_score: gold.quality_score,
      is_gold: gold.is_gold,
      clean_summary: gold.clean_summary,
      extracted_budget: gold.extracted_budget,
      filter_reason: gold.filter_reason,
    };
  });
}
