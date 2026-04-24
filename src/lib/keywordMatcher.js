// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Strict Keyword Matcher
//
// Mirrors the matching rules in redditClient.js (matchAndScore, ~L1860-1898)
// so the email notifier and the main gig feed agree on what "matches a user
// keyword" means.
//
// Rules:
//   • Multi-word keyword  → exact phrase substring (already specific enough)
//   • Single-word keyword → word-boundary regex
//       ─ ≤3 chars OR in EXACT_MATCH_REQUIRED → \bword\b (both boundaries,
//         whole-word only). Prevents "ui" from matching "build", "ux" from
//         matching "luxury", "java" from matching "javascript", etc.
//       ─ longer unambiguous tokens → \bword (leading boundary only) so
//         stems still match: "develop" → "developer", "development".
// ─────────────────────────────────────────────────────────────────────────────

// Keep this set in sync with redditClient.js EXACT_MATCH_REQUIRED.
const EXACT_MATCH_REQUIRED = new Set([
  "java",
  "react",
  "rust",
  "ruby",
  "node",
  "agent",
  "bot",
  "ion",
  "sol",
  "hub",
  "copy",
  "copywriting",
  "copywriter",
  "mobile",
]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Test whether a single user keyword strictly matches the given text.
 * `lowerText` must already be lowercased.
 */
export function keywordMatchesText(keyword, lowerText) {
  if (!keyword || !lowerText) return false;
  const kw = String(keyword).toLowerCase().trim();
  if (!kw) return false;

  if (kw.includes(" ")) {
    return lowerText.includes(kw);
  }

  const escaped = escapeRegex(kw);
  const needsBothBoundaries =
    kw.length <= 3 || EXACT_MATCH_REQUIRED.has(kw);
  const rx = new RegExp(
    `\\b${escaped}${needsBothBoundaries ? "\\b" : ""}`,
    "i",
  );
  return rx.test(lowerText);
}

/**
 * Returns true when at least one of the user's tracked keywords matches the
 * gig's title or body using strict word-boundary semantics. This is the same
 * gate the main gig feed applies, so emailed gigs and feed gigs stay in sync.
 */
export function gigMatchesUserKeywords(gig, keywords) {
  if (!keywords || keywords.length === 0) return false;
  const title = (gig?.title || "").toLowerCase();
  const body = (gig?.body_preview || "").toLowerCase();
  if (!title && !body) return false;
  const text = title + " " + body;
  return keywords.some((kw) => keywordMatchesText(kw, text));
}
