// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Strict Keyword Matcher
//
// Mirrors the matching rules in redditClient.js (matchAndScore) so the email
// notifier and the main gig feed agree on what "matches a user keyword" means.
//
// Rules:
//   • Multi-word keyword → exact phrase substring (already specific enough)
//   • Single-word keyword → word-boundary regex
//       ─ Stem roots (develop, design, market, write, edit, manage, …) use
//         leading boundary only so "develop" matches "developer"/"development".
//       ─ Everything else uses \bword\b (both boundaries). Prevents "automate"
//         from matching "automation", "java" from matching "javascript", etc.
//
// Keep in sync with: redditClient.js STEM_MATCH_KEYS
// ─────────────────────────────────────────────────────────────────────────────

const STEM_MATCH_KEYS = new Set([
  "develop",
  "design",
  "market",
  "write",
  "edit",
  "manage",
  "consult",
  "create",
  "build",
  "code",
  "program",
  "animate",
  "illustrat",
  "photograph",
  "translat",
  "transcrib",
  "automat",
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
  const needsStemMatch =
    STEM_MATCH_KEYS.has(kw) ||
    [...STEM_MATCH_KEYS].some((stem) => kw.startsWith(stem));
  const rx = needsStemMatch
    ? new RegExp(`\\b${escaped}`, "i")
    : new RegExp(`\\b${escaped}\\b`, "i");
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
