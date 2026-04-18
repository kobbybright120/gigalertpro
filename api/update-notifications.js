// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/update-notifications
//
// Toggles the authenticated user's email_notifications_enabled flag.
// Uses the service role key to bypass RLS.
//
// Headers:  Authorization: Bearer <supabase-access-token>
// Body:     { "enabled": true | false }
// Returns:  { ok: true }
//
// Required env vars:
//   VITE_SUPABASE_URL         — Supabase project URL
//   VITE_SUPABASE_ANON_KEY    — Supabase anon key (for JWT verification)
//   SUPABASE_SERVICE_ROLE_KEY — service role key (for profile update)
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_AUTH_URL = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/user` : null;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getSupabaseUser(token) {
  if (!SUPABASE_AUTH_URL) return null;
  const res = await fetch(SUPABASE_AUTH_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.VITE_SUPABASE_ANON_KEY || "",
    },
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1. Authenticate via Supabase JWT
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const supabaseUser = await getSupabaseUser(token);
  if (!supabaseUser?.id) {
    return res.status(401).json({ error: "Invalid auth token" });
  }

  // 2. Parse body
  const { enabled } = req.body || {};
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }

  // 3. Update profile using service role key (bypasses RLS)
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${supabaseUser.id}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email_notifications_enabled: enabled }),
    },
  );

  if (!patchRes.ok) {
    const errText = await patchRes.text();
    console.error("[update-notifications] Supabase error:", errText);
    return res.status(500).json({ error: "Failed to update notifications" });
  }

  return res.status(200).json({ ok: true });
}
