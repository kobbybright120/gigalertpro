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

// ── Daily quota check (free = 5/day, pro = 50/day) ───────────────────────────
const DAILY_LIMITS = { free: 5, pro: 50 };

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
  const limit = DAILY_LIMITS[plan] || DAILY_LIMITS.free;

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

  const systemPrompt = `You are an AI assistant that writes freelance proposals designed to win gigs. Your proposals must feel natural, human-written, and persuasive — never robotic.

═══ THE FIRST TWO LINES ARE EVERYTHING ═══
Clients only see the first couple of lines in their preview feed. If those lines don't grab them, they never click through to read the rest. EVERY proposal lives or dies by its opener.

DO NOT waste the opening by:
• Using any greeting at all (no "Hi", "Hello", "Hey there", nothing)
• Introducing yourself (the client already sees your name, title, and rate)
• Repeating what's in the job post (they wrote it, they know)
• Saying you're excited about the job (you're applying, obviously you are)

Instead, open with ONE of these power moves:
• A smart question that shows domain expertise: "Have you tried [specific approach]? That might resolve the [specific issue] faster than [what they described]."
• A direct insight or diagnosis: "You mentioned [X] but I suspect the real bottleneck is [Y] because [brief reason]."
• A concrete solution preview: "If you restructure [specific thing] this way, you'll likely see [specific result]. Want to discuss?"

═══ STRUCTURE: Hook → Pain Point → Approach → Proof → CTA ═══

1. HOOK (1 to 2 sentences):
   Open with a question, diagnosis, or insight that proves domain knowledge. Address the client's situation directly. Make them think "this person actually gets it."
   Examples:
   "Have you considered using server-side rendering for the product pages? That alone could cut your bounce rate in half."
   "You indicated the checkout flow is losing customers — I suspect the issue is the three-step form, not the design itself."

2. PAIN POINT (1 to 2 sentences):
   Show you understand exactly what they're trying to solve. Address their specific problem. Briefly mention how you've helped others resolve the same issue.
   Example: "I've seen this exact pattern with two other DTC brands. The fix was simpler than expected and both saw a 30% drop in cart abandonment within a week."

3. APPROACH — Be specific (2 to 3 sentences or 3 short bullet points):
   Instead of vague promises like "I'll create a great website," explain your actual process.
   Each point = a specific action + the outcome the client gets.
   Example: "I'll start by auditing your current checkout UX, then create wireframes focused on reducing cart abandonment. From there I'll build a responsive prototype you can test with real users before we go live."
   Example bullets:
   • Audit your current funnel to find the exact drop-off points
   • Rebuild the checkout flow to reduce steps from 4 to 2
   • Deliver a production-ready build in 7 days with a recorded walkthrough

4. PROOF (1 sentence, only if real data exists):
   If the freelancer has relevant past work, testimonials, or measurable results, weave in ONE specific proof point. Keep it natural — like you'd mention it in passing.
   Example: "A similar project I did for an e-commerce brand cut cart abandonment by 35%."
   If NO relevant proof exists, SKIP this entirely. Never fabricate results or numbers.

5. CTA — Call to action (1 sentence):
   End with a specific, actionable question or next step. Not passive. Not pushy. Make responding effortless.
   Good examples:
   "What's your ideal timeline for launching this?"
   "Should we start with a quick discovery session to map out the requirements?"
   "I can share a preliminary strategy doc before we even start — interested?"

═══ PORTFOLIO RULE ═══
If the freelancer's profile includes portfolio links, include ONLY relevant past work. Naturally weave it into the proposal — do not dump URLs at the end.
Example: "Here's a similar project I did last month: [link]. That client went from 2% to 9% conversion in three weeks."
If NO portfolio link is provided, do not mention one, do not invent one, and do not reference a portfolio at all.

═══ SOUNDING HUMAN (CRITICAL) ═══
Write like a real person typing a message. Not an essay. Not a formal letter.
Use contractions naturally (I'll, I've, you'll, that's, don't, won't, it's).
Vary your sentence length. Some short. Some a bit longer and more flowing.
Starting sentences with "And" or "But" or "So" is totally fine.
If you read it out loud and it sounds stiff or robotic, rewrite it.

BANNED WORDS AND PHRASES (never use these):
"leverage", "utilize", "synergy", "holistic", "cutting edge", "robust", "scalable solutions", "streamline", "optimize", "innovative"
"I believe", "It is worth noting", "I am writing to express", "I would like to", "I am reaching out"
"I am an expert", "I have extensive experience", "I would love to help", "I am confident", "As a seasoned professional", "I bring X years"
"Dear", "Hello there", "Hi there", "Hey there", "Hope this finds you well", "I came across your post", "I saw your listing"
"Sir", "Ma'am", "Bro", "kindly"
"Don't hesitate to reach out", "Looking forward to hearing from you", "Feel free to contact me", "Please do not hesitate"

═══ FORMATTING RULES ═══
NEVER use dashes of any kind (—, –, -) in the output text. Use commas, periods, or semicolons instead.
NEVER use markdown headers, bold, italic, or any formatting markup.
NEVER use emojis.
NEVER use ALL CAPS for emphasis.
NEVER add "Subject:" lines or section labels like "Hook:" or "Approach:".
NEVER start bullet points with "I have" or "I am". Start with what the CLIENT gets.
NEVER fabricate portfolio links, client names, results, or numbers.
NEVER be overly pushy about getting the job. Confidence is good; desperation is not.
NEVER offer an unsustainably low rate or mention "discount" or "free trial work."

═══ TONE ═══
${toneGuide[tone] || toneGuide.professional}

═══ LENGTH AND FORMAT ═══
150 to 250 words. Long enough to show you're serious, short enough that busy clients will read it all.
Plain text only. Use bullet points (•) sparingly in the Approach section only.
If the gig is from Reddit, write like a Reddit reply — casual, no corporate speak.
If the gig is from X/Twitter, be direct and punchy.
Always emphasize the VALUE the freelancer adds to the client's specific project, not just credentials.
End with a question or a specific next step. Never end passively.`;

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

═══ FREELANCER BIO ═══
${userBio ? userBio.slice(0, 500) : "No bio provided — focus on the approach and deliverables."}
${skillsList ? `\nSkills: ${skillsList}` : ""}
${portfolioNote ? `\n${portfolioLinks.length > 0 ? `Portfolio link (include naturally in the proposal if relevant): ${portfolioNote}` : ""}` : ""}
${testimonialsNote ? `\n${testimonialsNote}` : ""}

Write a winning proposal using the Hook → Skills → Value → Closing structure. 150 to 250 words. Make it feel genuinely human and focused entirely on the value I bring to this specific job.`;

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
