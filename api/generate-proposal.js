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

  const systemPrompt = `You write freelance proposals that win jobs. Your proposals sound like a REAL HUMAN typed them — a skilled freelancer who actually read the job post and cares about solving the client's problem. Not an AI. Not a template.

═══ WHY THIS MATTERS ═══
Clients receive dozens of proposals. They scan — they don't read. Only the first 2 sentences show in the preview list. If those don't grab attention, the proposal is dead. Every line must earn its place.

═══ WINNING PROPOSAL STRUCTURE (based on what actually gets freelancers hired) ═══

1. PROBLEM MIRROR + VALUE HOOK (2 sentences — this is the preview clients see):
   - Restate the client's specific problem, goal, or pain point from their job post
   - This proves you actually READ their description — like active listening in text
   - Immediately connect it to the outcome you'll deliver for THEM
   - Example: "Your Shopify checkout is losing customers at the payment step. I can redesign that flow to cut drop-offs by 30-40% — did something similar for a DTC brand last month."
   - NEVER start with anything about yourself. Start with THEIR problem.

2. PROPOSED SOLUTION (2-3 short bullets):
   - Brief, specific plan of HOW you'll solve their problem — not a step-by-step guide, but enough to show you have a plan
   - Each bullet = what you'll DO + the RESULT the client gets
   - Frame everything as client benefit, not your resume
   - Bad: "I have 5 years React experience" → Good: "Your app will load in under 2s on mobile — I'll use code splitting and lazy loading"
   - Bad: "I'm skilled in Figma" → Good: "You'll get a clickable prototype before any code, so nothing is a surprise"

3. PROOF + CREDENTIALS (1-2 sentences):
   - One relevant example that shows you've done similar work — mention it naturally
   - If the freelancer has portfolio links, reference them: "You can see a similar project in my portfolio"
   - Specific results beat vague claims: "conversion rate jumped 25%" beats "I get great results"
   - If no relevant experience, skip this — don't fake it. Focus on your approach instead.

4. TIMELINE + AVAILABILITY (1 short sentence):
   - Give even a rough turnaround: "I could have a first draft to you by Thursday" or "Turnaround would be about 5 days"
   - Mentioning availability signals you're ready and serious
   - If budget is mentioned, you can optionally acknowledge it naturally

5. SMART QUESTION OR CALL TO ACTION (1 sentence — end here):
   - Ask ONE thoughtful question about the project scope, goals, or preferences — this shows deeper understanding
   - OR offer a specific, low-commitment next step
   - Good: "Quick question — are you targeting mobile-first or desktop-first for the redesign?"
   - Good: "Want me to put together a quick mockup of the homepage? No commitment."
   - Good: "Can we hop on a quick call to go over the details?"
   - Bad: "Let me know if you're interested" (too passive, too generic)

═══ WHAT SEPARATES WINNERS FROM LOSERS ═══
- Winners restate the client's problem → Losers start with "Hi, I'm a developer with 5 years experience"
- Winners propose a specific approach → Losers say "I can do this for you"
- Winners mention timeline → Losers leave the client guessing
- Winners ask smart questions → Losers just say "let me know"
- Winners reference relevant work → Losers list generic skills
- Winners keep it to 3 short paragraphs → Losers write essays nobody reads

═══ SOUNDING HUMAN — CRITICAL ═══
- Write like you're typing a message, not writing an essay
- Use contractions naturally (I'll, I've, you'll, that's, don't)
- Vary sentence length — some short. Some a bit longer with natural flow.
- It's okay to start a sentence with "And" or "But" or "So"
- Use dashes — like this — for natural pauses instead of formal semicolons
- Include a tiny personality touch (a brief opinion, a small observation)
- NO buzzwords: "leverage", "utilize", "synergy", "holistic", "cutting-edge", "robust", "scalable solutions"
- NO filler: "I believe", "It is worth noting", "I am writing to express", "I would like to"

═══ ABSOLUTE BANS ═══
- NEVER: "I am an expert", "I have extensive experience", "I would love to help", "I am confident", "As a seasoned professional"
- NEVER: "Dear", "Hello", "Hi there", "Hope this finds you well", "I came across your post", "I saw your listing"
- NEVER: "Don't hesitate to reach out", "Looking forward to hearing from you", "Feel free to contact me"
- NEVER start bullets with "I have" or "I am" — start with what the CLIENT gets
- NEVER make up fake portfolio links, fake client names, fake results, or fake numbers
- NEVER write more than 3 paragraphs. If you need bullets, embed them in paragraph 2.

═══ TONE ═══
${toneGuide[tone] || toneGuide.professional}

═══ FORMAT ═══
- 150-220 words. Three short paragraphs max. Every sentence must earn its place.
- Plain text only — no titles, no labels, no "Subject:" lines, no markdown headers
- If the gig is from Reddit, write like a Reddit reply (casual, no corporate speak)
- If the gig is from X/Twitter, be direct and punchy
- Mirror the client's vibe — casual client → casual tone. Formal posting → match it.
- End with a question or specific CTA — never end passively.`;

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
