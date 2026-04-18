#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Test Email Script
//
// Sends a test email with sample gigs to verify Resend setup and template.
//
// Usage:
//   RESEND_API_KEY=re_xxx node scripts/test-email.js
//   (or set RESEND_API_KEY in .env and run: node --env-file=.env scripts/test-email.js)
// ─────────────────────────────────────────────────────────────────────────────

import { buildEmailHtml } from "./lib/email-notifier.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = process.argv[2] || "brightadenyo05@gmail.com";

if (!RESEND_API_KEY) {
  console.error("RESEND_API_KEY not set. Pass it as an env var.");
  process.exit(1);
}

const sampleGigs = [
  {
    title: "Need a React Developer for 3-Month SaaS Project",
    body_preview:
      "We're building a project management tool and need a senior React developer. Must have experience with TypeScript, Next.js, and Tailwind CSS. Remote work, flexible hours. Start immediately.",
    _platform: "Reddit",
    url: "https://reddit.com/r/forhire/example",
    quality_score: 85,
    extracted_budget: "$75-100/hr",
    id: "test_1",
  },
  {
    title: "Looking for Logo Designer - Startup Branding",
    body_preview:
      "Early-stage fintech startup needs a brand identity package. Logo, color palette, typography, and basic brand guidelines. Budget negotiable for the right designer.",
    _platform: "LinkedIn",
    url: "https://linkedin.com/posts/example",
    quality_score: 72,
    extracted_budget: "$2,500",
    id: "test_2",
  },
  {
    title: "Hiring Video Editor for YouTube Channel (Ongoing)",
    body_preview:
      "Growing tech YouTube channel (50k subs) needs a video editor for weekly uploads. Must know Premiere Pro or DaVinci Resolve. We provide raw footage and scripts.",
    _platform: "X",
    url: "https://x.com/user/status/example",
    quality_score: 68,
    extracted_budget: "$200/video",
    id: "test_3",
  },
];

const unsubUrl =
  "https://gigalertpro.com/api/unsubscribe-email?uid=test&sig=test";
const html = buildEmailHtml(sampleGigs, unsubUrl);

// Save HTML preview
import fs from "fs";
const previewPath = "scripts/test-email-preview.html";
fs.writeFileSync(previewPath, html);
console.log(`HTML preview saved to: ${previewPath}`);

// Send via Resend
console.log(`Sending test email to ${TO_EMAIL}...`);

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "GigAlertPro <notifications@gigalertpro.com>",
    to: [TO_EMAIL],
    subject: "3 new gigs matching your keywords",
    html,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
    },
  }),
});

if (!res.ok) {
  const err = await res.text();
  console.error(`Resend error (${res.status}):`, err);
  process.exit(1);
}

const data = await res.json();
console.log(`Email sent successfully! ID: ${data.id}`);
console.log(`Check ${TO_EMAIL} inbox (and spam folder).`);
