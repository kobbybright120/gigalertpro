// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Social Media Post Pre-Filter
//
// Regex-based pre-filter for Facebook/LinkedIn posts.
// Runs BEFORE the AI classifier to save tokens and improve accuracy.
//
// Returns: "keep" (high-confidence gig), "reject" (clear non-gig), "classify" (send to AI)
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_CONFIDENCE_GIG_PATTERNS = [
  /need a (graphic|web|ui|ux|video|content|social|logo|brand|motion|thumbnail|figma|canva|wordpress|shopify|react|python|flutter|android|ios|app|chatbot|seo|email|virtual|data|book|project|music|sound|voice|ugc|tiktok|youtube|podcast|copywriter|ghostwriter|translator)/i,
  /looking for a (graphic|web|ui|ux|video|content|social|logo|brand|motion|thumbnail|figma|canva|wordpress|shopify|react|python|flutter|android|ios|app|chatbot|seo|email|virtual|data|book|project|music|sound|voice|ugc|tiktok|youtube|podcast|copywriter|ghostwriter|translator)/i,
  /hiring a (graphic|web|ui|ux|video|content|social|logo|brand|motion|thumbnail|figma|canva|wordpress|shopify|react|python|flutter|android|ios|app|chatbot|seo|email|virtual|data|book|project|music|sound|voice|ugc|tiktok|youtube|podcast|copywriter|ghostwriter|translator)/i,
  /who can (design|build|edit|write|manage|create|develop|code|translate|animate|produce)/i,
  /dm me if you (are a|can|do|edit|design|build|write|manage|create)/i,
  /tag (a|someone who|a good)/i,
  /recommend (me a|a good)/i,
  /anyone know a good/i,
  /need someone to (design|build|edit|write|manage|create|develop|code|translate|animate|produce)/i,
];

const IMMEDIATE_REJECT_PATTERNS = [
  /I am a .* (designer|developer|editor|writer|marketer) (available|looking for|seeking)/i,
  /my (portfolio|services|rates|packages)/i,
  /hire me/i,
  /check out my work/i,
  /I offer/i,
  /my service/i,
  /color:|font-size:|text-decoration:|var\(--/i,
  /&amp;|&#x/i,
];

const MIN_LENGTH = 20;
const MAX_LENGTH = 2000;

/**
 * Check if post text is within valid length range.
 * @param {string} text
 * @returns {boolean}
 */
export function isValidLength(text) {
  return text.length >= MIN_LENGTH && text.length <= MAX_LENGTH;
}

/**
 * Pre-filter a social media post by text content.
 * @param {string} text - The post text to evaluate
 * @returns {"keep" | "reject" | "classify"}
 */
export function preFilterPost(text) {
  // Reject patterns first (fast path)
  for (const re of IMMEDIATE_REJECT_PATTERNS) {
    if (re.test(text)) return "reject";
  }
  // High-confidence keep patterns
  for (const re of HIGH_CONFIDENCE_GIG_PATTERNS) {
    if (re.test(text)) return "keep";
  }
  // Ambiguous — send to AI
  return "classify";
}
