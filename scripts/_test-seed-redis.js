// Temporary test script — writes mock gig data to Redis for YouTube, TikTok, Instagram
const ytData = JSON.stringify({
  posts: [
    {
      id: "yt_test1",
      name: "yt_test1",
      title: "Hiring a video editor for my YouTube channel - $500/month",
      selftext:
        "Looking for someone experienced with Premiere Pro or DaVinci Resolve. Long-term position. DM me if interested.",
      author: "CreatorStudio",
      author_name: "CreatorStudio",
      permalink: "https://www.youtube.com/watch?v=test1",
      subreddit: null,
      created_utc: Math.floor(Date.now() / 1000) - 3600,
      num_comments: 0,
      ups: 0,
      link_flair_text: "hiring video editor",
      _sub: "youtube",
      source: "yt-search-hiring-video-editor",
    },
    {
      id: "yt_test2",
      name: "yt_test2",
      title: "Need a graphic designer for thumbnails - paying $25/thumbnail",
      selftext:
        "I run a tech channel with 500k subs. Need consistent thumbnail designer. Photoshop skills required.",
      author: "TechTalks",
      author_name: "TechTalks",
      permalink: "https://www.youtube.com/watch?v=test2",
      subreddit: null,
      created_utc: Math.floor(Date.now() / 1000) - 7200,
      num_comments: 0,
      ups: 0,
      link_flair_text: "hiring graphic designer",
      _sub: "youtube",
      source: "yt-search-hiring-graphic-designer",
    },
    {
      id: "yt_test3",
      name: "yt_test3",
      title: "Looking for React developer to build my SaaS dashboard",
      selftext:
        "Budget: $3000. Need someone who knows React, Tailwind, and Supabase. Timeline: 3 weeks.",
      author: "IndieHacker",
      author_name: "IndieHacker",
      permalink: "https://www.youtube.com/watch?v=test3",
      subreddit: null,
      created_utc: Math.floor(Date.now() / 1000) - 1800,
      num_comments: 0,
      ups: 0,
      link_flair_text: "hiring react developer",
      _sub: "youtube",
      source: "yt-search-hiring-web-developer",
    },
  ],
  post_count: 3,
  cached_at: new Date().toISOString(),
  feed: "youtube-test",
});

const ttData = JSON.stringify({
  posts: [
    {
      id: "tt_test1",
      name: "tt_test1",
      title: "Hiring freelance social media manager - DM me",
      selftext:
        "Looking for someone to manage my TikTok and Instagram. $800/month. Must know Reels and TikTok trends.",
      author: "@brandgrowth",
      author_name: "@brandgrowth",
      permalink: "https://www.tiktok.com/@brandgrowth/video/test1",
      subreddit: null,
      created_utc: Math.floor(Date.now() / 1000) - 5400,
      num_comments: 0,
      ups: 0,
      link_flair_text: "hiring social media manager",
      _sub: "tiktok",
      source: "tt-search-hiringsocialmediamanager",
    },
    {
      id: "tt_test2",
      name: "tt_test2",
      title: "Need a Shopify developer ASAP - budget $2k",
      selftext:
        "My store needs custom theme work and app integrations. Shopify Liquid experience required. DM for details.",
      author: "@ecomqueen",
      author_name: "@ecomqueen",
      permalink: "https://www.tiktok.com/@ecomqueen/video/test2",
      subreddit: null,
      created_utc: Math.floor(Date.now() / 1000) - 900,
      num_comments: 0,
      ups: 0,
      link_flair_text: "hiring shopify developer",
      _sub: "tiktok",
      source: "tt-search-hiringshopifydeveloper",
    },
  ],
  post_count: 2,
  cached_at: new Date().toISOString(),
  feed: "tiktok-test",
});

const igData = JSON.stringify({
  posts: [
    {
      id: "ig_test1",
      title: "Looking for UGC creator for skincare brand",
      body_preview:
        "We need 4 UGC videos per month. $150/video. Send portfolio via DM.",
      author: "@glowbrands",
      posted_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      url: "https://www.instagram.com/p/test1/",
      _sub: "instagram",
      source: "instagram-playwright",
    },
    {
      id: "ig_test2",
      title: "Hiring freelance logo designer - paying $300",
      body_preview:
        "Need a modern minimalist logo for my startup. Send your portfolio and rates.",
      author: "@startupfounder",
      posted_at: new Date(Date.now() - 4 * 3600000).toISOString(),
      url: "https://www.instagram.com/p/test2/",
      _sub: "instagram",
      source: "instagram-playwright",
    },
  ],
  post_count: 2,
  cached_at: new Date().toISOString(),
  feed: "instagram-test",
});

async function main() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "")
    .trim()
    .replace(/^["']+|["']+$/g, "");

  if (!url || !token) {
    console.error("Missing UPSTASH credentials");
    process.exit(1);
  }

  const keys = [
    ["gigalertpro:youtube:latest", ytData],
    ["gigalertpro:tiktok:latest", ttData],
    ["gigalertpro:instagram:latest", igData],
  ];

  for (const [key, val] of keys) {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", key, val, "EX", 7200]),
    });
    const json = await resp.json();
    console.log(`${key} -> ${json.result}`);
  }

  console.log(
    "\nDone! Test data written to Redis. Refresh your app to see YouTube, TikTok, and Instagram gigs.",
  );
}

main();
