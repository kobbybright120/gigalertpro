// Smoke test for the strict keyword matcher used by the email notifier.
// Run: node scripts/test-keyword-matcher.js

import { gigMatchesUserKeywords } from "../src/lib/keywordMatcher.js";

const cases = [
  // ── User keywords: ["ui", "ux"] (the bug report case) ─────────────────────
  // Should MATCH: real UI/UX gigs
  {
    kws: ["ui", "ux"],
    gig: {
      title: "Hiring a UI/UX designer for our SaaS",
      body_preview: "Need someone with Figma experience for our dashboard",
    },
    expect: true,
    note: "explicit UI/UX gig",
  },
  {
    kws: ["ui", "ux"],
    gig: {
      title: "UX research project — $2k budget",
      body_preview: "Looking for a researcher to do user interviews",
    },
    expect: true,
    note: "UX standalone in title",
  },
  {
    kws: ["ui", "ux"],
    gig: {
      title: "Mobile app needs a UI refresh",
      body_preview: "We're an established startup ready to invest",
    },
    expect: true,
    note: "UI standalone in title",
  },

  // Should NOT match: substring false positives the loose matcher caught
  {
    kws: ["ui", "ux"],
    gig: {
      title: "Need Python developer to build a backend",
      body_preview: "Suitable for senior dev with API skills",
    },
    expect: false,
    note: "build/suitable contain 'ui' as substring — must NOT match",
  },
  {
    kws: ["ui", "ux"],
    gig: {
      title: "Video editor for YouTube channel",
      body_preview: "We're a luxury brand with daily clipping needs",
    },
    expect: false,
    note: "luxury contains 'ux' as substring — must NOT match",
  },
  {
    kws: ["ui", "ux"],
    gig: {
      title: "Quick fluid logo project",
      body_preview: "Cruise line needs new branding deluxe edition",
    },
    expect: false,
    note: "quick/fluid/cruise contain 'ui'; deluxe contains 'ux'",
  },
  {
    kws: ["ui", "ux"],
    gig: {
      title: "Junior copywriter wanted",
      body_preview: "Writing for influencer beauty brands, juicy contracts",
    },
    expect: false,
    note: "juicy contains 'ui' — must NOT match",
  },

  // ── User keywords: ["video editor"] (multi-word) ──────────────────────────
  {
    kws: ["video editor"],
    gig: {
      title: "Video editor needed for daily YouTube uploads",
      body_preview: "",
    },
    expect: true,
    note: "exact phrase in title",
  },
  {
    kws: ["video editor"],
    gig: {
      title: "Looking for a UI/UX designer",
      body_preview: "",
    },
    expect: false,
    note: "no video/editor at all",
  },
  {
    kws: ["video editor"],
    gig: {
      title: "Need a great video produced",
      body_preview: "Editor skills required for post-production",
    },
    expect: false,
    note: "video and editor are separated, not the phrase",
  },

  // ── User keywords: ["react"] (in EXACT_MATCH_REQUIRED) ────────────────────
  {
    kws: ["react"],
    gig: {
      title: "Senior React developer needed",
      body_preview: "",
    },
    expect: true,
    note: "react standalone",
  },
  {
    kws: ["react"],
    gig: {
      title: "Reaction analysis project for chemistry lab",
      body_preview: "",
    },
    expect: false,
    note: "react inside reaction — must NOT match (EXACT_MATCH_REQUIRED)",
  },
  {
    kws: ["react"],
    gig: {
      title: "Reactive system design consultant",
      body_preview: "",
    },
    expect: false,
    note: "react inside reactive — must NOT match",
  },

  // ── User keywords: ["develop"] (long, unambiguous — stem matching) ────────
  {
    kws: ["develop"],
    gig: {
      title: "Web developer for ecommerce store",
      body_preview: "",
    },
    expect: true,
    note: "stem match: developer",
  },
  {
    kws: ["develop"],
    gig: {
      title: "Software development team needed",
      body_preview: "",
    },
    expect: true,
    note: "stem match: development",
  },
  {
    kws: ["develop"],
    gig: {
      title: "Logo design for new brand",
      body_preview: "",
    },
    expect: false,
    note: "no develop stem",
  },

  // ── User keywords: ["ai"] (≤3 chars, both boundaries enforced) ────────────
  {
    kws: ["ai"],
    gig: {
      title: "AI engineer for generative chatbot",
      body_preview: "",
    },
    expect: true,
    note: "ai standalone",
  },
  {
    kws: ["ai"],
    gig: {
      title: "Aim for the stars marketing campaign",
      body_preview: "",
    },
    expect: false,
    note: "ai inside aim — must NOT match",
  },
  {
    kws: ["ai"],
    gig: {
      title: "Hairdresser needed for fashion shoot",
      body_preview: "Airline-themed style required",
    },
    expect: false,
    note: "ai inside hairdresser/airline — must NOT match",
  },

  // ── Empty keywords / empty gig edge cases ────────────────────────────────
  { kws: [], gig: { title: "anything", body_preview: "" }, expect: false, note: "no keywords" },
  { kws: ["ui"], gig: { title: "", body_preview: "" }, expect: false, note: "empty gig" },
];

let pass = 0;
let fail = 0;
for (const { kws, gig, expect, note } of cases) {
  const got = gigMatchesUserKeywords(gig, kws);
  const ok = got === expect;
  if (ok) pass++;
  else fail++;
  const mark = ok ? "PASS" : "FAIL";
  console.log(
    `[${mark}] kws=${JSON.stringify(kws).padEnd(20)} title="${(gig.title || "").slice(0, 50).padEnd(50)}" → expected ${String(expect).padEnd(5)} got ${String(got).padEnd(5)} | ${note}`,
  );
}
console.log(`\n${pass} passed, ${fail} failed (of ${cases.length})`);
process.exit(fail === 0 ? 0 : 1);
