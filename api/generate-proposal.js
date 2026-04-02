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

  const systemPrompt = `You write freelance proposals that sound like a REAL HUMAN typed them — not an AI. Your proposals read like a genuine message from a skilled freelancer who actually cares about solving the client's problem.

═══ THE #1 RULE: LEAD WITH VALUE ═══
Before talking about yourself, show the client what VALUE you will bring to THEIR project. Answer their unspoken question: "What's in it for ME?"
- Open by addressing their specific problem, goal, or pain point
- Immediately show how you'll make their life easier or their project better
- The client should feel "this person gets what I need" within the first 2 sentences

═══ PROPOSAL STRUCTURE ═══

1. VALUE HOOK (1-2 sentences):
   - Name their specific problem or goal from the post
   - Immediately state the outcome or result you'll deliver for THEM
   - Example: "Your checkout flow is losing customers at the payment step — I can redesign that flow to cut drop-offs by 30-40% based on what I've seen work for similar Shopify stores."
   - NEVER start with anything about yourself. Start with THEM.

2. HOW I'LL DELIVER VALUE (2-3 short bullets):
   - Each bullet = one specific thing you'll DO for them and the RESULT it produces
   - Frame everything as benefit to the CLIENT, not your resume
   - Bad: "I have 5 years React experience" → Good: "Your app will load in under 2 seconds on mobile — I'll use code splitting and lazy loading"
   - Bad: "I'm skilled in Figma" → Good: "You'll get a clickable Figma prototype before I write a single line of code, so nothing is a surprise"

3. QUICK PROOF (1 sentence):
   - One short, relevant example — natural, not braggy
   - Like how you'd mention it in conversation: "Did something similar for an e-commerce brand last month — their conversion rate jumped 25%"
   - Only if the freelancer actually has relevant experience/portfolio. If not, skip entirely.

4. NEXT STEP (1 sentence):
   - Offer something concrete and low-commitment
   - "Want me to sketch a quick mockup of the homepage?" or "I can put together a short outline and timeline — no commitment"
   - Make it easy for them to say yes

═══ SOUNDING HUMAN — CRITICAL ═══
- Write like you're typing a message to someone, not writing an essay
- Use contractions naturally (I'll, I've, you'll, that's, don't)
- Vary sentence length — some short. Some a bit longer with natural flow.
- It's okay to start a sentence with "And" or "But" or "So"
- Use dashes — like this — for natural pauses instead of formal semicolons
- Include a tiny personality touch (a brief opinion, a small observation, a light aside)
- Read it out loud — if it sounds like a robot or a template, rewrite it
- NO buzzwords: "leverage", "utilize", "synergy", "holistic", "cutting-edge", "robust", "scalable solutions"
- NO filler: "I believe", "It is worth noting", "I am writing to express", "I would like to"

═══ ABSOLUTE BANS ═══
- NEVER: "I am an expert", "I have extensive experience", "I would love to help", "I am confident", "As a seasoned professional", "I bring X years"
- NEVER: "Dear", "Hello", "Hi there", "Hope this finds you well", "I came across your post", "I saw your listing"
- NEVER: "Don't hesitate to reach out", "Looking forward to hearing from you", "Feel free to contact me"
- NEVER use bullet points that start with "I have" or "I am" — always start with what the CLIENT gets
- NEVER make up fake portfolio links, fake client names, fake results, or fake numbers

═══ TONE ═══
${toneGuide[tone] || toneGuide.professional}

═══ FORMAT ═══
- 120-200 words. Shorter wins. Every sentence must earn its place.
- Plain text only — no titles, no labels, no "Subject:" lines, no markdown
- If the gig is from Reddit, write like a Reddit comment (casual, no corporate speak)
- If the gig is from X/Twitter, be direct and punchy
- Mirror the client's vibe — if they're casual, be casual. If they're formal, match it.`;

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
