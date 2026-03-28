// ============================================================
// GigAlertPro – Reddit Scanner Edge Function  (NO API KEY)
// Uses public Reddit JSON endpoints — zero cost, no OAuth.
// Deploy : supabase functions deploy scan-reddit --no-verify-jwt
// Trigger: pg_cron every 2 minutes (see SETUP.md)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Config ──────────────────────────────────────────────────
const SUBREDDITS = [
  "forhire",
  "slavelabour",
  "freelance",
  "hiring",
  "jobbit",
  "remotework",
];

const USER_AGENT =
  "GigAlertPro/1.0 (educational project; contact: gigalertpro@proton.me)";

// Delay between each subreddit fetch (ms) — keeps us well under limits
const INTER_SUB_DELAY_MS = 2_000;

// ── Helpers ─────────────────────────────────────────────────

/** Random jitter in range [0, maxMs) */
function jitter(maxMs = 1_000): number {
  return Math.floor(Math.random() * maxMs);
}

/** Sleep helper */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extract a rough budget string from text */
function extractBudget(text: string): string | null {
  const m = text.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?/);
  return m ? m[0] : null;
}

// ── Fetch new posts via PUBLIC JSON (no API key) ────────────
// Endpoint: https://www.reddit.com/r/{sub}/new.json?limit=25&raw_json=1
// Includes exponential back-off on 429 / 5xx and honours Retry-After.
async function fetchNewPosts(
  subreddit: string,
  _lastPostId: string,
): Promise<any[]> {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=25&raw_json=1`;

  const MAX_RETRIES = 4;
  let backoff = 3_000; // start at 3 s

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (res.ok) {
      const json = await res.json();
      return (json?.data?.children || []).map((c: { data: unknown }) => c.data);
    }

    // Rate-limited or server error → back off
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter
        ? Number(retryAfter) * 1_000
        : backoff + jitter(1_000);
      console.warn(
        `r/${subreddit} returned ${res.status} – retry in ${waitMs}ms (attempt ${attempt + 1})`,
      );
      await sleep(waitMs);
      backoff = Math.min(backoff * 2, 60_000); // cap at 60 s
      continue;
    }

    // Unexpected status → give up for this sub
    console.error(`r/${subreddit} returned ${res.status} – skipping`);
    return [];
  }

  console.error(`r/${subreddit} – max retries reached, skipping`);
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
    let rateLimited = 0;

    for (const sub of SUBREDDITS) {
      const lastId = stateMap[sub] || "";
      const posts = await fetchNewPosts(sub, lastId);

      if (posts.length === 0) continue;

      // Track newest post id for this batch
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

        const text = `${post.title} ${post.selftext || ""}`.toLowerCase();

        // Match keywords
        const matched = allKeywords.filter((kw) => text.includes(kw));
        if (matched.length === 0) continue;

        // Upsert the gig alert
        const { data: alertData, error: alertErr } = await supabase
          .from("gig_alerts")
          .upsert(
            {
              reddit_post_id: post.id,
              title: post.title,
              body_preview: (post.selftext || "").slice(0, 500),
              url: `https://www.reddit.com${post.permalink}`,
              subreddit: sub,
              budget: extractBudget(`${post.title} ${post.selftext || ""}`),
              author: post.author,
              reddit_created: new Date(post.created_utc * 1000).toISOString(),
              matched_keywords: matched,
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
          subreddit: sub,
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
        rateLimited,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Scanner error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
