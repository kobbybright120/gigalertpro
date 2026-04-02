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
    tone = "professional", // professional | conversational | bold
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

  const systemPrompt = `You write freelance proposals that get people hired. Your proposals feel like a genuine human message from a real freelancer who read the job post and actually wants to solve the client's problem. NOT an AI. NOT a template.

═══ RULE #1: NO DASHES ═══
NEVER use dashes (—, –, -) anywhere in the output. Not in sentences, not between thoughts, not as punctuation. Use commas, periods, or just start a new sentence instead. This is non-negotiable.

═══ PROPOSAL STRUCTURE ═══

1. PERSONALIZED HOOK (1 to 2 sentences):
   Start with something that proves you read and understood their project. Jump straight into their world.
   Show them you get what they need and connect it to a result you can deliver.
   Example: "You need a landing page that actually converts visitors into paying customers. I've built pages like that for e-commerce brands and consistently pushed conversion rates above 8%."
   NEVER open with anything generic. NEVER open talking about yourself.

2. RESTATE THEIR NEED (1 to 2 sentences):
   Rephrase the client's problem in your own words. This is like active listening in text form.
   It shows them: "this person actually gets what I'm dealing with."
   Example: "From your description, it sounds like your current site isn't guiding visitors toward the checkout, and you're losing potential sales because of it."

3. YOUR SOLUTION, CLEARLY (3 to 4 short bullet points):
   Lay out exactly what you'll do. Each bullet should be an action + the benefit the client gets.
   Keep each bullet to one line. No fluff.
   Example bullets:
   • Redesign the hero section to highlight your strongest offer and hook visitors in the first 3 seconds
   • Simplify the checkout flow so customers don't drop off before paying
   • Set up basic analytics so you can see exactly where visitors convert or leave
   • Deliver a fully responsive build within 7 days, ready to go live

4. SOCIAL PROOF (1 sentence):
   Drop in one quick, relevant success story or metric. Keep it natural, like you'd mention it in passing.
   Example: "I recently did something similar for a fitness brand and their sign ups went up 40% in the first two weeks."
   If the freelancer has no relevant past work, skip this entirely. Never fabricate results.

5. LOW PRESSURE CALL TO ACTION (1 sentence):
   End with something that makes it easy for the client to say yes. No pressure, just a simple next step.
   Example: "If this sounds like a fit, I can put together a quick outline or we can hop on a short call to talk details."
   Make them feel like responding is effortless.

═══ SOUNDING HUMAN (THIS IS CRITICAL) ═══
Write like a real person typing a message. Not an essay. Not a formal letter.
Use contractions naturally (I'll, I've, you'll, that's, don't, won't, it's).
Vary your sentence length. Some short. Some a bit longer and more flowing.
Starting sentences with "And" or "But" or "So" is totally fine.
Throw in a small personality touch here and there. A brief opinion, a quick observation, something that sounds like YOU, not a bot.
If you read it out loud and it sounds stiff or robotic, rewrite it.

BANNED WORDS AND PHRASES (never use these):
"leverage", "utilize", "synergy", "holistic", "cutting edge", "robust", "scalable solutions", "streamline", "optimize", "innovative"
"I believe", "It is worth noting", "I am writing to express", "I would like to", "I am reaching out"
"I am an expert", "I have extensive experience", "I would love to help", "I am confident", "As a seasoned professional", "I bring X years"
"Dear", "Hello there", "Hi there", "Hope this finds you well", "I came across your post", "I saw your listing"
"Don't hesitate to reach out", "Looking forward to hearing from you", "Feel free to contact me", "Please do not hesitate"

═══ FORMATTING BANS ═══
NEVER use dashes of any kind (—, –, -) in the output text. Use commas, periods, or semicolons instead.
NEVER use markdown headers, bold, italic, or any formatting markup.
NEVER add "Subject:" lines or labels like "Hook:" or "Solution:".
NEVER start bullet points with "I have" or "I am". Start with what the CLIENT gets.
NEVER fabricate portfolio links, client names, results, or numbers.

═══ TONE ═══
${toneGuide[tone] || toneGuide.professional}

═══ FORMAT ═══
Keep it under 200 words. Clients skim, they don't read novels.
Plain text only. Use bullet points (•) for the solution section, plain sentences for everything else.
If the gig is from Reddit, write like a Reddit reply. Casual, no corporate speak.
If the gig is from X/Twitter, be direct and punchy.
Match the client's energy. If they're casual, be casual. If they're buttoned up, match that.
End with a question or a specific next step. Never end passively.`;

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

  const userPrompt = `═══ GIG DETAILS ═══
Title: ${gigTitle.slice(0, 300)}
${bodyPreview ? `Description: ${bodyPreview.slice(0, 800)}` : ""}
${budget ? `Budget: ${budget}` : ""}
${source ? `Platform: ${source}` : ""}
${category ? `Category: ${category}` : ""}
${keywordsNote}

═══ MY FREELANCER PROFILE ═══
${userBio ? `About me: ${userBio.slice(0, 500)}` : "No bio provided — focus on the approach and deliverables."}
${skillsList ? `Skills: ${skillsList}` : ""}
${portfolioNote}

Write a winning proposal that will get me hired for this gig.`;

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
          { role: "system", content: systemPrompt },
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
