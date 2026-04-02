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

// ── Log usage to Supabase (fire-and-forget) ───────────────────────────────────
async function logUsage(userId, model, usage) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const baseUrl = process.env.VITE_SUPABASE_URL;
  if (!serviceKey || !baseUrl) return;

  const costEstimate =
    (usage.prompt_tokens || 0) * 0.00000075 +
    (usage.completion_tokens || 0) * 0.0000045;

  await fetch(`${baseUrl}/rest/v1/ai_usage`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
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

  // ── 3. Validate body ─────────────────────────────────────────────────────────
  const {
    gigTitle,
    bodyPreview = "",
    budget = "",
    source = "",
    userSkills = [],
    userBio = "",
    portfolioLinks = [],
  } = req.body || {};

  if (!gigTitle || typeof gigTitle !== "string") {
    return res.status(400).json({ error: "gigTitle is required." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "AI service not configured." });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // ── 4. Build prompt ──────────────────────────────────────────────────────────
  const systemPrompt = `You are an expert freelance proposal writer who helps freelancers win clients.
Write a concise, tailored, and persuasive proposal. Rules:
- Opening hook (1 sentence): show you read their post and understand the goal.
- Fit section (2–3 bullet points): reference the specific skills and experience that match this job.
- Approach (2 sentences): briefly explain HOW you will deliver — methodology, tools, timeline hints.
- Portfolio reference: mention one relevant portfolio link if provided, otherwise skip this section.
- Call-to-action (1 sentence): invite a reply or short call.
- Total length: 150–200 words max.
- Never use cliché phrases like "I am an expert", "I have extensive experience", "I would love to help".
- Write in first person, professional yet warm tone.
- Output the proposal text only — no titles, no labels.`;

  const skillsList =
    Array.isArray(userSkills) && userSkills.length > 0
      ? userSkills.join(", ")
      : "freelance services";

  const portfolioNote =
    Array.isArray(portfolioLinks) && portfolioLinks.length > 0
      ? `Portfolio links: ${portfolioLinks.slice(0, 2).join(", ")}`
      : "";

  const userPrompt = `Job title: ${gigTitle.slice(0, 200)}
${bodyPreview ? `Job details: ${bodyPreview.slice(0, 600)}` : ""}
${budget ? `Stated budget: ${budget}` : ""}
${source ? `Platform: ${source}` : ""}

Freelancer profile:
${userBio ? `About me: ${userBio.slice(0, 400)}` : ""}
My skills: ${skillsList}
${portfolioNote}

Write a winning proposal for this job.`;

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
        temperature: 0.35,
        max_tokens: 450,
        frequency_penalty: 0.25,
        presence_penalty: 0.1,
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

  const proposal =
    openaiData.choices?.[0]?.message?.content?.trim() || "";
  if (!proposal) {
    return res.status(502).json({ error: "AI returned an empty response." });
  }

  // ── 6. Log usage (non-blocking) ──────────────────────────────────────────────
  logUsage(supabaseUser.id, model, openaiData.usage || {});

  return res.status(200).json({ proposal });
}
