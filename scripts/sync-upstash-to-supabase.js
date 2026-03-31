// sync-upstash-to-supabase.js
// Fetch gig data from Upstash and insert into Supabase gig_alerts table

import "dotenv/config";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

// --- CONFIG ---
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = "gigalertpro:latest";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role for inserts

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fetchFromUpstash() {
  const url = `${UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(REDIS_KEY)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!resp.ok) throw new Error("Failed to fetch from Upstash");
  const json = await resp.json();
  return JSON.parse(json.result);
}

async function syncToSupabase(posts) {
  // Map incoming posts to the gig_alerts schema and convert timestamps
  const mapped = posts
    .map((post) => {
      const reddit_post_id =
        post.id || post.reddit_post_id || post.post_id || null;
      const title = post.title || post._title || post.link_title || "";
      const body_preview = (
        post.selftext ||
        post.body ||
        post.description ||
        ""
      ).slice(0, 500);
      const url =
        post.url ||
        (post.permalink ? `https://www.reddit.com${post.permalink}` : null);
      const subreddit = post.subreddit || post.subreddit_name || null;
      const budget = post.budget || null;
      const author = post.author || null;
      const matched_keywords = post.matched_keywords || post.keywords || [];

      let reddit_created = post.reddit_created || post.created_utc || null;
      // Normalize epoch seconds -> ISO string; keep ISO if already provided
      if (reddit_created && typeof reddit_created === "number") {
        reddit_created = new Date(reddit_created * 1000).toISOString();
      } else if (
        reddit_created &&
        typeof reddit_created === "string" &&
        /^[0-9]+$/.test(reddit_created)
      ) {
        reddit_created = new Date(Number(reddit_created) * 1000).toISOString();
      }

      return {
        reddit_post_id,
        title,
        body_preview,
        url,
        subreddit,
        budget,
        author,
        matched_keywords,
        reddit_created,
      };
    })
    // require critical fields present to avoid insert errors
    .filter(
      (p) =>
        p.reddit_post_id && p.title && p.url && p.subreddit && p.reddit_created,
    );

  if (mapped.length === 0) {
    console.log("No valid posts to sync");
    return;
  }

  // Try bulk upsert first (fast) — this requires a uniqueness constraint on `url`.
  try {
    const { error } = await supabase
      .from("gig_alerts")
      .upsert(mapped, { onConflict: "reddit_post_id" });
    if (error) throw error;
    console.log(`Bulk upserted ${mapped.length} gigs to Supabase.`);
    return;
  } catch (err) {
    console.warn(
      "Bulk upsert failed (maybe missing unique index on url), falling back to safe per-row upsert:",
      err.message || err,
    );
  }

  // Fallback: for each post, check existence and insert/update accordingly to avoid duplicates
  let synced = 0;
  for (const row of mapped) {
    try {
      const { data: existing, error: selErr } = await supabase
        .from("gig_alerts")
        .select("id")
        .eq("reddit_post_id", row.reddit_post_id)
        .limit(1)
        .maybeSingle();
      if (selErr) throw selErr;
      if (existing) {
        const { error: upErr } = await supabase
          .from("gig_alerts")
          .update(row)
          .eq("reddit_post_id", row.reddit_post_id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from("gig_alerts").insert(row);
        if (insErr) throw insErr;
      }
      synced += 1;
    } catch (e) {
      console.error("Failed to sync row", row.url, e.message || e);
    }
  }
  console.log(`Safely synced ${synced}/${mapped.length} gigs to Supabase.`);
}

(async () => {
  try {
    const data = await fetchFromUpstash();
    if (!data || !data.posts) throw new Error("No posts found in Upstash");
    await syncToSupabase(data.posts);
    console.log("Sync complete!");
  } catch (err) {
    console.error("Sync failed:", err.message);
    process.exit(1);
  }
})();
