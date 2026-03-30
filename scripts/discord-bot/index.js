#!/usr/bin/env node
// Discord bot: listen for job/gig keywords and push matching messages to Upstash Redis

const dotenv = require("dotenv");
dotenv.config();

const { Client, GatewayIntentBits } = require("discord.js");

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN in environment");
  process.exit(1);
}
if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.error(
    "Missing Upstash REST env vars (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)",
  );
  process.exit(1);
}

const DEFAULT_KEYWORDS = [
  "hiring",
  "for hire",
  "freelance",
  "freelancer",
  "looking for",
  "job",
  "gig",
  "hire",
  "seeking",
  "contractor",
];
const KEYWORDS = (process.env.DISCORD_KEYWORDS || DEFAULT_KEYWORDS.join(","))
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function redisCmd(cmdArray) {
  const url = UPSTASH_REDIS_REST_URL.replace(/\/+$/, "");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmdArray),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upstash command failed: ${res.status} ${body}`);
  }
  return res.json();
}

client.on("ready", () => {
  console.log(`Discord bot ready — logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (!message || message.author?.bot) return;
    if (!message.guild) return; // ignore DMs

    const text = (message.content || "").toLowerCase();
    const matched = KEYWORDS.some((k) => text.includes(k));
    if (!matched) return;

    const payload = {
      id: message.id,
      content: message.content,
      author: { id: message.author.id, tag: message.author.tag },
      guild: { id: message.guild.id, name: message.guild.name },
      channel: { id: message.channel.id, name: message.channel.name },
      created_utc: Math.floor((message.createdTimestamp || Date.now()) / 1000),
      url: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`,
      source: "discord",
    };

    const KEY = "gigalertpro:discord:latest";
    // push recent messages to a capped list (500 items) and set a TTL
    await redisCmd(["LPUSH", KEY, JSON.stringify(payload)]);
    await redisCmd(["LTRIM", KEY, "0", "499"]);
    await redisCmd(["EXPIRE", KEY, "86400"]); // keep for 24h

    console.log(
      `[discord-bot] stored ${payload.id} from ${payload.guild.name}/${payload.channel.name}`,
    );
  } catch (err) {
    console.error("[discord-bot] error handling message:", err?.message || err);
  }
});

client.login(DISCORD_BOT_TOKEN).catch((err) => {
  console.error("Discord login failed:", err?.message || err);
  process.exit(1);
});
