// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/generate-proposal
//
// Accepts:  { gigTitle, bodyPreview, budget, source, userSkills, userBio, portfolioLinks }
// Headers:  Authorization: Bearer <supabase-access-token>
// Returns:  { proposal: string }
//
// Security:
//  • Validates Supabase JWT before calling OpenAI
//  • OPENAI_API_KEY never leaves server
//  • In-memory rate limit: 10 proposals/min per user
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const SUPABASE_AUTH_URL = process.env.VITE_SUPABASE_URL
  ? `${process.env.VITE_SUPABASE_URL}/auth/v1/user`
  : null;

// ── In-memory rate limiter (resets on cold start) ────────────────────────────
const rateLimits = new Map();
const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_WINDOW = 10;

function isRateLimited(userId) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const timestamps = (rateLimits.get(userId) || []).filter((t) => t > cutoff);
  if (timestamps.length >= MAX_PER_WINDOW) return true;
  timestamps.push(now);
  rateLimits.set(userId, timestamps);
  return false;
}

// ── Verify Supabase JWT ───────────────────────────────────────────────────────
async function getSupabaseUser(token) {
  if (!SUPABASE_AUTH_URL) return null;
  const res = await fetch(SUPABASE_AUTH_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.VITE_SUPABASE_ANON_KEY || "",
    },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ── Supabase helpers (service-role) ────────────────────────────────────────────
function supabaseHeaders() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

// ── Daily quota check per plan ─────────────────────────────────────────────────
const DAILY_LIMITS = { free: 0, basic: 10, pro: 50, agency: Infinity };

async function checkDailyQuota(userId) {
  const baseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) return { allowed: true }; // skip if not configured

  // Fetch user plan
  const profileRes = await fetch(
    `${baseUrl}/rest/v1/profiles?id=eq.${userId}&select=plan`,
    { headers: supabaseHeaders() },
  );
  const profiles = await profileRes.json().catch(() => []);
  const plan = profiles?.[0]?.plan || "free";
  const limit = DAILY_LIMITS[plan] ?? DAILY_LIMITS.free;

  // Count today's usage
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const countRes = await fetch(
    `${baseUrl}/rest/v1/ai_usage?user_id=eq.${userId}&created_at=gte.${todayStart.toISOString()}&select=id`,
    { headers: { ...supabaseHeaders(), Prefer: "count=exact" } },
  );
  const countHeader = countRes.headers.get("content-range") || "";
  const total = parseInt(countHeader.split("/")[1] || "0", 10);

  return {
    allowed: total < limit,
    used: total,
    limit,
    plan,
  };
}

// ── Log usage to Supabase (fire-and-forget) ───────────────────────────────────
async function logUsage(userId, model, usage) {
  const baseUrl = process.env.VITE_SUPABASE_URL;
  if (!baseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const costEstimate =
    (usage.prompt_tokens || 0) * 0.00000075 +
    (usage.completion_tokens || 0) * 0.0000045;

  await fetch(`${baseUrl}/rest/v1/ai_usage`, {
    method: "POST",
    headers: { ...supabaseHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      model,
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      cost_estimate: costEstimate,
    }),
  }).catch(() => {}); // never block the response
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const rawAuth = req.headers.authorization || "";
  const token = rawAuth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return res.status(401).json({ error: "Missing authorization token." });
  }

  const supabaseUser = await getSupabaseUser(token);
  if (!supabaseUser?.id) {
    return res.status(401).json({ error: "Invalid or expired session." });
  }

  // ── 2. Rate limit ────────────────────────────────────────────────────────────
  if (isRateLimited(supabaseUser.id)) {
    return res
      .status(429)
      .json({ error: "Too many requests. Please wait a moment." });
  }

  // ── 2b. Daily quota (free: 5/day, pro: 50/day) ─────────────────────────────
  const quota = await checkDailyQuota(supabaseUser.id);
  if (!quota.allowed) {
    return res.status(429).json({
      error: `Daily limit reached (${quota.used}/${quota.limit}). ${quota.plan === "free" ? "Upgrade to Pro for 50 proposals/day." : "Try again tomorrow."}`,
    });
  }

  // ── 3. Validate body ─────────────────────────────────────────────────────────
  // (body fields extracted in step 4 below)

  // ── 4. Build prompt ──────────────────────────────────────────────────────────
  const {
    gigTitle,
    bodyPreview = "",
    budget = "",
    source = "",
    category = "",
    matchedKeywords = [],
    userSkills = [],
    userBio = "",
    portfolioLinks = [],
    testimonials = [],
    tone = "professional", // professional | conversational | bold
    upvotes = 0,
    commentCount = 0,
  } = req.body || {};

  if (!gigTitle || typeof gigTitle !== "string") {
    return res.status(400).json({ error: "gigTitle is required." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "AI service not configured." });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // Tone instructions
  const toneGuide = {
    professional:
      "Write in a polished, professional tone. Confident but not arrogant. Business-appropriate.",
    conversational:
      "Write in a friendly, conversational tone. Like chatting with a colleague. Still professional but relaxed and human.",
    bold: "Write in a bold, high-energy tone. Stand out from the crowd. Confident, direct, slightly provocative. Show personality.",
  };

  const systemPrompt = `You are an expert freelance proposal writer. Your job is to write proposals that feel like they were written by a real, confident freelancer who has done their homework, not by an AI or a template.

Study this real winning proposal as your style guide:

--- STYLE EXAMPLE ---
"I will help you get 5k followers in 5 months

My portfolio: https://docs.google.com/presentation/d/example

Hi,

I see you are looking for a social media manager to help you grow your cleaning company's online presence, you are in luck. I have over 20 million views and over 100k followers across multiple accounts under my belt, and I will be applying the same system I use for my other client accounts to yours. I will be creating a social media strategy, learning from bigger competitors in your niche and studying them, then applying working pieces from their content to yours while still being authentic to your brand voice. I'll come up with engaging content from videos and images that actually gets people to stop scrolling."
--- END EXAMPLE ---

What makes that proposal work:
1. Opens with a specific, bold PROMISE (not a greeting, not "I saw your post")
2. Shares a portfolio link immediately after the promise, before anything else
3. Starts the actual message with "Hi," then immediately shows they read the post
4. Uses a confident, casual tone ("you are in luck") without being arrogant
5. Drops a real, specific credential (20 million views, 100k followers) naturally
6. Explains the EXACT approach they will take, step by step
7. Stays authentic and human throughout

═══ YOUR STRUCTURE FOR EVERY PROPOSAL ═══

1. PROMISE LINE (first line, standalone):
   Start with a short, bold, specific promise tied to the outcome the client wants.
   Examples:
   "I will deliver your Shopify rebuild in 10 days."
   "I will get your site from 3 seconds to under 1 second load time."
   "I will design a logo you actually love, or I revise until you do."

2. PORTFOLIO LINE (second line, standalone):
   On its own line: "My portfolio: [link]" or "My work: [link]"
   Only include this if portfolio links are provided. If none, skip it entirely. Do not invent a link.

3. GREETING + SITUATION (1 to 2 sentences):
   Start with "Hi," then immediately show you read the post by referencing their specific situation.
   Example: "Hi, I see you are looking for a React developer to rebuild your SaaS dashboard, you are in luck."

4. CREDENTIAL DROP (1 sentence):
   One specific, real credential that is directly relevant to this gig. A number, a past outcome, a scale of work done.
   Example: "I have built 12 SaaS dashboards over the last 3 years, including one that handles 50k daily events for a fintech startup."
   If no specific credential is provided in the freelancer bio, skip this. Never fabricate numbers.

5. WHAT YOU WILL DO (2 to 4 sentences or 3 bullet points):
   Explain your actual plan for their specific project. Show you have thought about it.
   Each point should be a concrete action tied to an outcome they care about.
   Example: "I will start by auditing your current checkout flow to find where customers drop off. From there I will rebuild the critical pages first so you see results fast. I will keep you updated every step with a shared Notion doc so nothing is a surprise."

6. CLOSE (1 sentence):
   End with a direct, easy question or a specific next step. Make it easy to say yes.
   Examples:
   "What is your timeline for getting this live?"
   "Should we hop on a quick 15-minute call this week?"
   "I can send over a plan document today if that helps."

═══ TONE RULES ═══
${toneGuide[tone] || toneGuide.professional}

Write like a real person. Use contractions. Keep sentences short. If it sounds like a cover letter, rewrite it.
If the gig is from Reddit, be conversational and direct like a Reddit post reply, not a formal pitch.
If the gig is from X/Twitter, make it punchy and to the point.

═══ BANNED WORDS AND PHRASES ═══
"leverage", "utilize", "synergy", "holistic", "cutting edge", "robust", "scalable solutions", "streamline", "optimize", "innovative"
"I believe", "I am writing to express", "I would like to", "I am reaching out", "I came across your post", "I saw your listing"
"I am an expert", "I have extensive experience", "I would love to help", "I am confident", "As a seasoned professional"
"Dear", "Hello there", "Hi there", "Hey there", "Hope this finds you well"
"Don't hesitate to reach out", "Looking forward to hearing from you", "Feel free to contact me"

═══ FORMATTING RULES ═══
NEVER use dashes (em dash, en dash, hyphen) anywhere in the output.
NEVER use markdown headers, bold, italic, or any formatting markup.
NEVER use emojis.
NEVER use ALL CAPS.
NEVER add "Subject:" lines or structural labels.
NEVER fabricate portfolio links, client names, results, or numbers.
Plain text only. Use bullet points (•) only in the "What you will do" section if needed.

═══ LENGTH ═══
150 to 220 words. Short enough that a busy client reads it all. Long enough to show you are serious.`;

  // ── 4b. Fetch user's past winning proposals for few-shot learning ─────────────
  let fewShotSection = "";
  const baseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (baseUrl && serviceKey) {
    try {
      const wonRes = await fetch(
        `${baseUrl}/rest/v1/proposals?user_id=eq.${supabaseUser.id}&outcome=eq.won&select=gig_title,text&order=created_at.desc&limit=3`,
        { headers: supabaseHeaders() },
      );
      const wonProposals = await wonRes.json().catch(() => []);
      if (Array.isArray(wonProposals) && wonProposals.length > 0) {
        const examples = wonProposals
          .map(
            (w, i) =>
              `--- WINNING EXAMPLE ${i + 1} ---\nGig: ${w.gig_title}\nProposal:\n${w.text}`,
          )
          .join("\n\n");
        fewShotSection = `\n\n═══ THIS FREELANCER'S PAST WINNING PROPOSALS ═══
These are real proposals this person sent that won the gig. Study the voice, the style, the phrasing. Write the new proposal in the same voice — personalized to the new gig.

${examples}

════════════════════════════════════════════`;
      }
    } catch {
      // non-blocking — proceed without few-shot examples
    }
  }

  // ── 4c. Competition signal ────────────────────────────────────────────────────
  const competitionLevel =
    upvotes > 50 || commentCount > 20
      ? "high"
      : upvotes > 15 || commentCount > 8
        ? "medium"
        : "low";

  const competitionNote =
    competitionLevel === "high"
      ? "\n\n⚠️ HIGH COMPETITION (many upvotes/replies on this gig): Open with something completely unexpected. Be hyper-specific about THEIR exact problem. Every other freelancer will write a generic opener — yours must not."
      : competitionLevel === "medium"
        ? "\n\nMEDIUM COMPETITION: Several people have seen this. Open with something concrete and specific. Avoid anything that sounds like a template."
        : "";

  const systemPromptFull = systemPrompt + fewShotSection + competitionNote;

  const skillsList =
    Array.isArray(userSkills) && userSkills.length > 0
      ? userSkills.join(", ")
      : "";

  const portfolioNote =
    Array.isArray(portfolioLinks) && portfolioLinks.length > 0
      ? `My portfolio: ${portfolioLinks.slice(0, 3).join(", ")}`
      : "";

  const keywordsNote =
    Array.isArray(matchedKeywords) && matchedKeywords.length > 0
      ? `Matched keywords: ${matchedKeywords.join(", ")}`
      : "";

  const testimonialsNote =
    Array.isArray(testimonials) && testimonials.length > 0
      ? `My past wins and social proof (use these naturally as proof points — never fabricate):\n${testimonials
          .slice(0, 5)
          .map((t) => `  • ${t}`)
          .join("\n")}`
      : "";

  const userPrompt = `═══ JOB DESCRIPTION ═══
Job title: ${gigTitle.slice(0, 300)}
${bodyPreview ? `Full description: ${bodyPreview.slice(0, 800)}` : ""}
${budget ? `Budget: ${budget}` : ""}
${source ? `Platform: ${source}` : ""}
${category ? `Category: ${category}` : ""}
${keywordsNote}

═══ FREELANCER PROFILE ═══
${userBio ? userBio.slice(0, 500) : "No bio provided. Focus on the approach and deliverables."}
${skillsList ? `\nSkills: ${skillsList}` : ""}
${portfolioLinks.length > 0 ? `\nPortfolio (put on its own line right after the promise, exactly like the style example): ${portfolioLinks.slice(0, 1).join(", ")}` : ""}
${testimonialsNote ? `\n${testimonialsNote}` : ""}

Write the proposal following this exact structure: Promise line, then portfolio line (only if a link is provided), then "Hi," greeting with their situation, credential drop, what you will do, close with a question. 150 to 220 words. Plain text only.`;

  // ── 5. Call OpenAI ───────────────────────────────────────────────────────────
  let openaiData;
  try {
    const openaiRes = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPromptFull },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.45,
        max_tokens: 600,
        frequency_penalty: 0.4,
        presence_penalty: 0.2,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.json().catch(() => ({}));
      console.error("[generate-proposal] OpenAI error:", errBody);
      const msg =
        openaiRes.status === 429
          ? "AI quota exceeded. Please try again shortly."
          : "AI service error. Please try again.";
      return res.status(502).json({ error: msg });
    }

    openaiData = await openaiRes.json();
  } catch (err) {
    console.error("[generate-proposal] fetch error:", err);
    return res.status(500).json({ error: "Failed to reach AI service." });
  }

  const proposal = openaiData.choices?.[0]?.message?.content?.trim() || "";
  if (!proposal) {
    return res.status(502).json({ error: "AI returned an empty response." });
  }

  // ── 6. Log usage (non-blocking) ──────────────────────────────────────────────
  logUsage(supabaseUser.id, model, openaiData.usage || {});

  return res.status(200).json({ proposal });
}
