// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — AI Gig Classifier (GPT-4o-mini)
//
// Classifies scraped posts as real gigs vs noise BEFORE storing in Redis.
// Catches everything regex misses: freelancer self-promos, rants, discussions,
// agency marketing, portfolio showcases, career advice, industry commentary,
// product ads, complaints about hiring — across ALL freelancing niches.
//
// Usage:
//   import { classifyAndFilter } from "./gig-classifier.js";
//   const realGigs = await classifyAndFilter(posts);
//
// Gracefully degrades: if OPENAI_API_KEY is missing, returns all posts unfiltered.
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const BATCH_SIZE = 15; // posts per API call — balances cost & latency
const CONCURRENCY = 3; // parallel API calls
const TIMEOUT_MS = 20_000; // per-batch timeout

// ── System prompt — tuned for precision across all freelancing niches ─────────

const SYSTEM_PROMPT_DEFAULT = `You are a strict job/gig post classifier for GigAlertPro, a paid freelancing platform. Users pay money to see REAL gig opportunities. Showing irrelevant posts makes users cancel their subscription.

For each post, decide: is a CLIENT actively looking to HIRE or PAY a freelancer for work?

═══ OUTPUT "1" (real gig) ONLY if ALL of these are true: ═══
• A specific person, company, or client needs work done
• There is a clear task, role, or project (even if vague like "need help with my website")
• The poster is the one HIRING (not offering services)
• It reads like a job/task listing, request for help, or "looking to hire" post

═══ OUTPUT "0" (not a gig) if the post matches ANY of these: ═══
• Freelancer/professional advertising their OWN services or availability
  ("I'm a developer", "hire me", "portfolio inside", "available for work",
   "X years experience", "open for commissions", "[profession] here",
   "developer here", "designer here", "writer here", "editor here",
   "X projects completed", "X+ projects", "my portfolio", "check out my work",
   "taking on new clients", "available for new projects", "DMs open",
   "offering services", "my services include", "I specialize in",
   "I can help you with", "I build", "I design", "I write")
• Someone LOOKING FOR work/clients (job seeker, not job poster)
• Discussion, rant, question, or opinion about hiring, freelancing, or the industry
  ("Do you feel like this is a problem?", "I'm tired of...", "What do you think about...")
• Career advice, tips, guides, strategies, or motivational content
• Agency, company, or service marketing ("we place VAs", "our team handles...")
• Product, tool, SaaS, app, course, newsletter, or community promotion
• Portfolio showcase or sharing past work ("I designed this for a client")
• Complaints about hiring practices, rates, or the market
• Engagement bait ("follow me", "like & retweet", "tag someone")
• General questions ("how do I get started?", "what's the best way to...")
• Stories, anecdotes, or personal experiences about freelancing
• Unpaid, volunteer, or exposure-only offers
• Mod posts, rules, weekly threads, meta discussions
• News articles or industry reports
• Jokes, memes, or sarcasm about hiring/freelancing

═══ EDGE CASES — classify as 0: ═══
• Post MENTIONS "hiring" in quotes, as commentary, or in a negative context
  ("I see tweets saying 'hiring a video editor' but..." → 0)
• Post uses hiring vocabulary but is really a discussion or complaint → 0
• Freelancer title that sounds like a job but is self-promotion
  ("Part-Time Remote Web Developer Available | Portfolio Inside" → 0)
• "Shopify developer here, 50+ projects" (freelancer advertising services → 0)
• "[skill] developer/designer/writer/editor here" with project counts → 0
• Posts asking for recommendations or opinions, not hiring → 0

═══ CRITICAL RULE: ═══
When genuinely unsure, lean toward "0". Self-promotion posts from freelancers
are common on job subreddits and MUST be rejected. Only output "1" when the
post clearly reads as a client/company seeking to hire or pay someone.

Respond with ONLY index:classification pairs, one per line.
Format: NUMBER:0 or NUMBER:1
Example:
1:1
2:0
3:1`;

// ── Social prompt — more permissive for informal Facebook/LinkedIn posts ──────

const SYSTEM_PROMPT_SOCIAL = `You are classifying social media posts from Facebook and LinkedIn to determine if they are genuine client requests looking to hire a freelancer for a specific task or project.

MARK AS GIG (is_gig: true) if the post:
- Is someone looking to HIRE or find a freelancer, designer, developer, editor, writer, marketer or any skilled person
- Contains phrases like "need a", "looking for a", "hiring a", "who can", "anyone know a good", "DM me if you", "tag someone who", "recommend me a"
- Is a business or individual posting that they need help with a specific task
- Mentions a project, task or ongoing work they need done
- Has a budget or mentions payment even vaguely like "will pay", "paid opportunity", "budget available"
- Is an individual founder or small business owner asking for help

MARK AS NOT GIG (is_gig: false) if the post:
- Is someone OFFERING their own services — "I am a designer available for hire"
- Is a job listing from a large corporation requiring office attendance
- Is completely unrelated to hiring or finding skilled help
- Is spam, promotional content or an advertisement
- Is a motivational post, news article or general discussion
- Contains CSS code, HTML or technical web content

Important: Facebook and LinkedIn posts are often informal and short. A post saying just "Need a video editor DM me" IS a genuine gig. Do not reject posts for being too short or informal.

Respond with ONLY index:classification pairs, one per line.
Format: NUMBER:0 or NUMBER:1
Example:
1:1
2:0
3:1`;

function getSystemPrompt(platform) {
  return platform === "social" ? SYSTEM_PROMPT_SOCIAL : SYSTEM_PROMPT_DEFAULT;
}

// ── Core classifier ──────────────────────────────────────────────────────────

/**
 * Classify an array of posts using GPT-4o-mini.
 * Returns a new array with `_ai_is_gig` boolean added to each post.
 * Posts that couldn't be classified get `_ai_is_gig: undefined`.
 */
export async function classifyPosts(posts, platform) {
  if (!OPENAI_API_KEY) {
    console.log(
      "[classifier] ⚠ No OPENAI_API_KEY set — skipping AI classification",
    );
    return posts;
  }

  if (posts.length === 0) return posts;

  console.log(
    `[classifier] Classifying ${posts.length} posts with ${OPENAI_MODEL}...`,
  );
  const start = Date.now();

  // Work on copies to avoid mutation issues
  const tagged = posts.map((p) => ({ ...p }));

  // Split into batches
  const batches = [];
  for (let i = 0; i < tagged.length; i += BATCH_SIZE) {
    batches.push({ startIdx: i, posts: tagged.slice(i, i + BATCH_SIZE) });
  }

  // Process batches with limited concurrency
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((b) => classifyBatch(b.posts, platform)));
  }

  // Stats
  const realGigs = tagged.filter((p) => p._ai_is_gig === true).length;
  const rejected = tagged.filter((p) => p._ai_is_gig === false).length;
  const untagged = tagged.filter((p) => p._ai_is_gig === undefined).length;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `[classifier] ✅ Done in ${elapsed}s — ${realGigs} real gigs, ${rejected} rejected, ${untagged} unclassified`,
  );

  return tagged;
}

/**
 * Classify posts and return ONLY the real gigs (+ unclassified as safety net).
 * This is the main function to call from fetch scripts.
 */
export async function classifyAndFilter(posts, platform) {
  const tagged = await classifyPosts(posts, platform);

  // Keep: real gigs + unclassified (safety net — don't drop posts AI couldn't reach)
  const kept = tagged.filter((p) => p._ai_is_gig !== false);
  const dropped = tagged.length - kept.length;

  if (dropped > 0) {
    console.log(
      `[classifier] Filtered out ${dropped} non-gig posts (${kept.length} remaining)`,
    );
  }

  return kept;
}

// ── Batch processing ─────────────────────────────────────────────────────────

async function classifyBatch(batch, platform) {
  // Build compact post descriptions for the API
  const descriptions = batch
    .map((p, i) => {
      const title = (p.title || "").slice(0, 200).trim();
      const body = (p.selftext || "").slice(0, 300).trim();
      const source = p._sub || p.subreddit || p.source || "unknown";
      const flair = p.link_flair_text ? ` [${p.link_flair_text}]` : "";
      return `${i + 1}. [${source}${flair}] "${title}"${body ? `\n   ${body}` : ""}`;
    })
    .join("\n\n");

  const userMessage = `Classify these ${batch.length} posts:\n\n${descriptions}`;

  try {
    const resp = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: getSystemPrompt(platform) },
            { role: "user", content: userMessage },
          ],
          temperature: 0.05, // near-deterministic for classification
          max_tokens: 120, // ~4 tokens per post (e.g., "1:0\n")
        }),
      },
      TIMEOUT_MS,
    );

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.warn(
        `[classifier] OpenAI ${resp.status}: ${errBody.slice(0, 200)}`,
      );
      return; // leave batch untagged
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse "1:1\n2:0\n3:1" format
    for (const line of content.trim().split("\n")) {
      const m = line.match(/(\d+)\s*:\s*([01])/);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        if (idx >= 0 && idx < batch.length) {
          batch[idx]._ai_is_gig = m[2] === "1";
        }
      }
    }

    // Log token usage for cost monitoring
    if (data.usage) {
      const { prompt_tokens, completion_tokens } = data.usage;
      const cost =
        (prompt_tokens || 0) * 0.00000015 +
        (completion_tokens || 0) * 0.0000006;
      console.log(
        `[classifier]   Batch ${batch.length} posts: ${prompt_tokens}+${completion_tokens} tokens ($${cost.toFixed(6)})`,
      );
    }
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn(
        `[classifier] Timeout on batch of ${batch.length} — skipping`,
      );
    } else {
      console.warn(`[classifier] Error: ${err.message}`);
    }
    // Untagged posts pass through — client-side regex handles them
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}
