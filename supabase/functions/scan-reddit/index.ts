// ============================================================
// GigAlertPro – Reddit Scanner Edge Function  (NO API KEY)
// Uses public Reddit JSON endpoints — zero cost, no OAuth.
// Deploy : supabase functions deploy scan-reddit --no-verify-jwt
// Trigger: pg_cron every 2 minutes (see SETUP.md)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Subreddit Config ────────────────────────────────────────
// "search" mode uses Reddit flair search to pre-filter hiring posts.
// "new" mode fetches newest posts from the subreddit.
interface SubConfig {
  name: string;
  mode: "search" | "new";
  search?: string;
  weight: number;
}

const SUBREDDITS: SubConfig[] = [
  // Flair-filtered subs (only hiring/task posts)
  { name: "forhire", mode: "search", search: "flair:Hiring", weight: 1.3 },
  { name: "slavelabour", mode: "search", search: "flair:Task", weight: 1.2 },
  // General job/hiring subs
  { name: "hiring", mode: "new", weight: 1.2 },
  { name: "freelance_forhire", mode: "new", weight: 1.0 },
  { name: "gameDevClassifieds", mode: "new", weight: 0.9 },
  { name: "DesignJobs", mode: "new", weight: 1.0 },
  { name: "ProgrammingJobs", mode: "new", weight: 1.1 },
  { name: "CodingJobs", mode: "new", weight: 1.1 },
  { name: "Programmers_forhire", mode: "new", weight: 1.0 },
  { name: "SoftwareEngineerJobs", mode: "new", weight: 1.1 },
  { name: "WebDeveloperJobs", mode: "new", weight: 1.1 },
  { name: "techjobs", mode: "new", weight: 1.0 },
  { name: "WebDevJobs", mode: "new", weight: 1.1 },
  { name: "MachineLearningJobs", mode: "new", weight: 1.0 },
  { name: "DeveloperJobs", mode: "new", weight: 1.1 },
  { name: "GraphicDesignJobs", mode: "new", weight: 1.0 },
  { name: "Designers_forhire", mode: "new", weight: 1.0 },
  { name: "HireAnEditor", mode: "new", weight: 1.0 },
  { name: "ContentWriter_forhire", mode: "new", weight: 1.0 },
  { name: "IllustratorsForHire", mode: "new", weight: 1.0 },
  { name: "artistforhire", mode: "new", weight: 1.0 },
  { name: "forhire2", mode: "new", weight: 1.0 },
  { name: "YouTubeEditorsForHire", mode: "new", weight: 1.0 },
  { name: "VoiceWork", mode: "new", weight: 1.0 },
  { name: "VideoEditors_forhire", mode: "new", weight: 1.0 },
  { name: "VoiceActing", mode: "new", weight: 0.9 },
  { name: "MarketingJobs", mode: "new", weight: 1.0 },
  { name: "hireforgigs", mode: "new", weight: 1.1 },
  { name: "ForHireFreelance", mode: "new", weight: 1.0 },
  { name: "DevsForHire", mode: "new", weight: 1.1 },
  { name: "Jobs4Bitcoins", mode: "new", weight: 0.9 },
  { name: "WritingJobBoard", mode: "new", weight: 1.0 },
  { name: "freelance", mode: "new", weight: 0.8 },
  { name: "jobbit", mode: "new", weight: 1.0 },
  { name: "remotework", mode: "new", weight: 0.9 },
];

const USER_AGENT =
  "GigAlertPro/1.0 (educational project; contact: gigalertpro@proton.me)";

const INTER_SUB_DELAY_MS = 2_000;

// ── Self-Promotion Detection (freelancer ads — REJECT these) ──
const SELF_PROMO_PATTERNS = [
  /\[for\s?hire\]/i,
  /\bfor\s?hire\b/i,
  /\bhire\s?me\b/i,
  /\[offer\]/i,
  /\bi\s?(?:am|'m)\s+(?:a|an)\b.{0,50}\b(designer|developer|writer|editor|freelanc|coder|artist|programmer|marketer|consultant|engineer|animator|videograph)/i,
  /\boffering\s+my\b/i,
  /\boffering\b.{0,25}\bservices?\b/i,
  /\bavailable\s+for\b.{0,25}\b(work|projects?|freelanc|gigs?|hire)\b/i,
  /\blooking\s+for\b.{0,25}\b(work|clients?|projects?|opportunities|gigs?)\b/i,
  /\bmy\s+(?:services|portfolio|rates?|work)\b/i,
  /\bopen\s+(?:to|for)\s+(?:work|commissions|projects?)\b/i,
  /\bportfolio\s*:/i,
  /\[portfolio\]/i,
  /\[seeking/i,
  /\[available\]/i,
  /\[looking\s+for\s+work\]/i,
];

// ── Hiring Signals (clients seeking work — we WANT these) ──
const HIRING_SIGNALS: Array<{ rx: RegExp; score: number }> = [
  { rx: /\[hiring\]/i, score: 25 },
  { rx: /\[task\]/i, score: 25 },
  { rx: /\[paid\]/i, score: 20 },
  { rx: /\bhiring\b/i, score: 15 },
  {
    rx: /\blooking\s+for\b.{0,35}\b(?:a|an)?\s*(?:designer|developer|writer|editor|freelanc|coder|programmer|marketer|va|virtual\s?assistant|consultant|someone|contractor|expert|specialist|agency)/i,
    score: 20,
  },
  {
    rx: /\bneed\b.{0,25}\b(?:a|an)?\s*(?:designer|developer|writer|editor|freelanc|coder|programmer|marketer|consultant|someone|help|person|expert)\b/i,
    score: 18,
  },
  {
    rx: /\bseeking\b.{0,25}\b(?:a|an)?\s*(?:designer|developer|writer|freelanc|someone|expert|contractor)/i,
    score: 16,
  },
  { rx: /\bwill\s+pay\b/i, score: 15 },
  { rx: /\bi(?:'ll| will)\s+pay\b/i, score: 15 },
  { rx: /\bpaying\b/i, score: 12 },
  { rx: /\bbudget\b.{0,10}\b\$?\d/i, score: 14 },
  { rx: /\bwe(?:'re|\s+are)\s+looking\b/i, score: 16 },
  {
    rx: /\bour\s+(?:team|company|startup|agency|firm)\b.{0,35}\b(?:needs?|looking|seeking|hiring|searching)\b/i,
    score: 18,
  },
  {
    rx: /\bremote\b.{0,15}\b(?:position|role|job|gig|opportunity|work)\b/i,
    score: 8,
  },
  { rx: /\bcan\s+(?:someone|anyone|anybody)\b/i, score: 12 },
  { rx: /\bhelp\s+(?:me|us|needed|wanted|required)\b/i, score: 10 },
];

// ── Junk Filters ──
const JUNK_PATTERNS = [
  /\[meta\]/i,
  /\[mod\s?post\]/i,
  /\[announcement\]/i,
  /\bweekly\s+thread\b/i,
  /\bmonthly\s+thread\b/i,
  /\brule\s+\d/i,
  /\bautomod/i,
  /\bsubreddit\s+rules?\b/i,
];

// ── Category Detection ──
const CATEGORIES: Array<{ label: string; rx: RegExp }> = [
  {
    label: "Development",
    rx: /\b(develop|coding|programm|software|web\s?dev|frontend|backend|full.?stack|react|angular|vue|node|python|java|php|ruby|swift|flutter|mobile\s?app|android|ios|api|database|wordpress|shopify|html|css|javascript|typescript)\b/i,
  },
  {
    label: "Design",
    rx: /\b(design|logo|graphic|ui\/?ux|figma|photoshop|illustrat|brand|visual|banner|poster|flyer|infographic|thumbnail|canva)\b/i,
  },
  {
    label: "Writing",
    rx: /\b(writ|copywriting|content|blog|article|seo\s?writ|ghostwrit|technical\s?writ|edit|proofread|translat|transcript)\b/i,
  },
  {
    label: "Marketing",
    rx: /\b(market|seo|social\s?media|ads?\b|advertis|email\s?market|ppc|google\s?ads|facebook\s?ads|growth|funnel|lead\s?gen|influencer)\b/i,
  },
  {
    label: "Video & Audio",
    rx: /\b(video|animation|motion|after\s?effects|premiere|youtube|podcast|audio|voice.?over|narrator)\b/i,
  },
  {
    label: "Data & AI",
    rx: /\b(data|machine\s?learn|ai\b|artificial|scraping|analy|automat|bot|chatbot|gpt|llm|neural|deep\s?learn)\b/i,
  },
  {
    label: "Virtual Assistant",
    rx: /\b(virtual\s?assistant|va\b|admin|data\s?entry|research|customer\s?service|support|bookkeep|scheduling)\b/i,
  },
];

// ── Helpers ─────────────────────────────────────────────────

function jitter(maxMs = 1_000): number {
  return Math.floor(Math.random() * maxMs);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractBudget(text: string): string | null {
  // Range: $500-$1000, $1k-5k
  const range = text.match(
    /\$\s?[\d,]+(?:\.\d{1,2})?(?:k)?\s*[-–—to]+\s*\$?\s?[\d,]+(?:\.\d{1,2})?(?:k)?/i,
  );
  if (range) return range[0].replace(/\s+/g, " ").trim();
  // Hourly: $50/hr, $30 per hour
  const hourly = text.match(
    /\$\s?[\d,]+(?:\.\d{1,2})?\s*(?:\/\s*h(?:ou)?r|per\s+h(?:ou)?r)/i,
  );
  if (hourly) return hourly[0].replace(/\s+/g, " ").trim();
  // "k" shorthand: $5k, $2.5k
  const kMatch = text.match(/\$\s?[\d,.]+\s*k\b/i);
  if (kMatch) return kMatch[0].replace(/\s+/g, "");
  // Plain: $500
  const plain = text.match(/\$\s?[\d,]+(?:\.\d{1,2})?/);
  return plain ? plain[0].replace(/\s/g, "") : null;
}

function detectCategory(text: string): string | null {
  for (const cat of CATEGORIES) {
    if (cat.rx.test(text)) return cat.label;
  }
  return null;
}

function isJunk(title: string): boolean {
  return JUNK_PATTERNS.some((rx) => rx.test(title));
}

function isSelfPromotion(
  title: string,
  body: string,
  flair: string | null,
): boolean {
  // Explicit title tags are definitive
  if (/\[for\s?hire\]/i.test(title) || /\[offer\]/i.test(title)) return true;
  if (/\bfor\s?hire\b/i.test(title) && !/\[hiring\]/i.test(title)) return true;
  if (/\[portfolio\]/i.test(title)) return true;
  if (/\[seeking/i.test(title)) return true;
  if (/\[available\]/i.test(title)) return true;

  // Flair-based detection
  if (flair) {
    const f = flair.toLowerCase();
    if (
      f.includes("for hire") ||
      f.includes("portfolio") ||
      f.includes("seeking") ||
      f.includes("available") ||
      f.includes("looking for work")
    )
      return true;
  }

  // Strong hiring signal in title overrides body self-promo
  if (HIRING_SIGNALS.some((s) => s.rx.test(title))) return false;

  const text = title + " " + body;
  return SELF_PROMO_PATTERNS.some((rx) => rx.test(text));
}

function computeScore(
  post: any,
  matchedKwCount: number,
  totalKws: number,
  subWeight: number,
): number {
  let score = 0;
  const text = (post.title || "") + " " + (post.selftext || "");

  // Hiring signal strength (0-40 pts)
  let hiringPts = 0;
  for (const signal of HIRING_SIGNALS) {
    if (signal.rx.test(text)) hiringPts += signal.score;
  }
  score += Math.min(40, hiringPts);

  // Keyword match density (0-25 pts)
  score += Math.min(
    25,
    Math.round((matchedKwCount / Math.max(1, totalKws)) * 25),
  );

  // Budget mentioned (0-10 pts)
  if (/\$\s?\d/.test(text)) score += 10;

  // Recency bonus (0-15 pts)
  if (post.created_utc) {
    const ageHours = (Date.now() / 1000 - post.created_utc) / 3600;
    if (ageHours < 1) score += 15;
    else if (ageHours < 6) score += 12;
    else if (ageHours < 24) score += 8;
    else if (ageHours < 72) score += 4;
  }

  // Engagement bonus (0-5 pts)
  const comments = post.num_comments || 0;
  if (comments >= 1 && comments <= 10) score += 3;
  if (comments === 0) score += 5;

  // Post length bonus (0-5 pts)
  const bodyLen = (post.selftext || "").length;
  if (bodyLen > 200) score += 5;
  else if (bodyLen > 50) score += 2;

  // Subreddit weight multiplier
  score = Math.round(score * (subWeight || 1));

  return Math.min(100, Math.max(0, score));
}

// ── Fetch posts via PUBLIC JSON (no API key) ────────────────
async function fetchSubredditPosts(sub: SubConfig): Promise<any[]> {
  let url: string;
  if (sub.mode === "search" && sub.search) {
    url = `https://www.reddit.com/r/${sub.name}/search.json?q=${encodeURIComponent(sub.search)}&restrict_sr=1&sort=new&limit=25&raw_json=1`;
  } else {
    url = `https://www.reddit.com/r/${sub.name}/new.json?limit=25&raw_json=1`;
  }

  const MAX_RETRIES = 4;
  let backoff = 3_000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (res.ok) {
      const json = await res.json();
      return (json?.data?.children || []).map((c: { data: unknown }) => c.data);
    }

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter
        ? Number(retryAfter) * 1_000
        : backoff + jitter(1_000);
      console.warn(
        `r/${sub.name} returned ${res.status} – retry in ${waitMs}ms (attempt ${attempt + 1})`,
      );
      await sleep(waitMs);
      backoff = Math.min(backoff * 2, 60_000);
      continue;
    }

    console.error(`r/${sub.name} returned ${res.status} – skipping`);
    return [];
  }

  console.error(`r/${sub.name} – max retries reached, skipping`);
  return [];
}

// ── Main handler ────────────────────────────────────────────
Deno.serve(async () => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Missing Supabase env vars", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Load all keywords from all users
    const { data: keywordRows } = await supabase
      .from("keywords")
      .select("keyword, user_id");

    if (!keywordRows || keywordRows.length === 0) {
      return new Response(JSON.stringify({ message: "No keywords to scan" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build keyword → user_ids map
    const kwMap: Record<string, string[]> = {};
    for (const row of keywordRows) {
      const kw = row.keyword.toLowerCase();
      if (!kwMap[kw]) kwMap[kw] = [];
      kwMap[kw].push(row.user_id);
    }
    const allKeywords = Object.keys(kwMap);

    // Load scanner state (last_post_id per subreddit)
    const { data: states } = await supabase
      .from("scanner_state")
      .select("subreddit, last_post_id");
    const stateMap: Record<string, string> = {};
    for (const s of states || []) stateMap[s.subreddit] = s.last_post_id;

    let totalInserted = 0;
    let totalAlerts = 0;
    let totalSkippedPromo = 0;
    let totalSkippedJunk = 0;

    for (const sub of SUBREDDITS) {
      const lastId = stateMap[sub.name] || "";
      const posts = await fetchSubredditPosts(sub);

      if (posts.length === 0) continue;

      // Ensure scanner_state row exists for new subreddits
      await supabase
        .from("scanner_state")
        .upsert(
          {
            subreddit: sub.name,
            last_post_id: lastId || "",
            last_scanned_at: new Date().toISOString(),
          },
          { onConflict: "subreddit" },
        );

      let newestId = lastId;

      for (const post of posts) {
        // Skip posts we've already processed
        if (post.id === lastId) continue;
        if (
          !newestId ||
          post.created_utc >
            (posts.find((p: any) => p.id === newestId)?.created_utc || 0)
        ) {
          newestId = post.id;
        }

        const title = post.title || "";
        const body = post.selftext || "";
        const flair = post.link_flair_text || null;

        // ── Skip junk (mod posts, rules, meta) ──
        if (isJunk(title)) {
          totalSkippedJunk++;
          continue;
        }

        // ── Skip deleted / removed ──
        if (body === "[removed]" || body === "[deleted]") continue;
        if (post.author === "[deleted]" || post.author === "AutoModerator")
          continue;

        // ── Skip self-promotions (freelancer ads) ──
        if (isSelfPromotion(title, body, flair)) {
          totalSkippedPromo++;
          continue;
        }

        const text = `${title} ${body}`.toLowerCase();

        // Match keywords
        const matched = allKeywords.filter((kw) => text.includes(kw));
        if (matched.length === 0) continue;

        // Compute relevance score
        const score = computeScore(
          post,
          matched.length,
          allKeywords.length,
          sub.weight,
        );

        // Skip very low relevance posts
        if (score < 10) continue;

        // Detect category
        const category = detectCategory(`${title} ${body}`);

        // Upsert the gig alert with all metadata
        const { data: alertData, error: alertErr } = await supabase
          .from("gig_alerts")
          .upsert(
            {
              reddit_post_id: post.id,
              title: title,
              body_preview: body.slice(0, 500),
              url: `https://www.reddit.com${post.permalink}`,
              subreddit: sub.name,
              budget: extractBudget(`${title} ${body}`),
              author: post.author,
              reddit_created: new Date(post.created_utc * 1000).toISOString(),
              matched_keywords: matched,
              score,
              comment_count: post.num_comments || 0,
              upvotes: post.ups || 0,
              flair: flair,
              category: category,
            },
            { onConflict: "reddit_post_id" },
          )
          .select("id")
          .single();

        if (alertErr) {
          console.error("Alert upsert error:", alertErr.message);
          continue;
        }
        totalInserted++;

        // Fan-out: create a user_alert for every user whose keyword matched
        const userIds = new Set<string>();
        for (const kw of matched) {
          for (const uid of kwMap[kw]) userIds.add(uid);
        }

        const userAlertRows = [...userIds].map((uid) => ({
          user_id: uid,
          alert_id: alertData.id,
          is_read: false,
          dismissed: false,
        }));

        if (userAlertRows.length > 0) {
          const { error: uaErr } = await supabase
            .from("user_alerts")
            .upsert(userAlertRows, { onConflict: "user_id,alert_id" });

          if (uaErr) console.error("user_alerts upsert error:", uaErr.message);
          else totalAlerts += userAlertRows.length;
        }
      }

      // Update scanner state so we don't re-process these posts
      if (newestId && newestId !== lastId) {
        await supabase.from("scanner_state").upsert({
          subreddit: sub.name,
          last_post_id: newestId,
          last_scanned_at: new Date().toISOString(),
        });
      }

      // Polite delay + jitter between subreddits
      await sleep(INTER_SUB_DELAY_MS + jitter(1_000));
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: SUBREDDITS.length,
        newAlerts: totalInserted,
        userNotifications: totalAlerts,
        skippedSelfPromo: totalSkippedPromo,
        skippedJunk: totalSkippedJunk,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Scanner error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
