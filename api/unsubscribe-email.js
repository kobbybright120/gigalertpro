// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: GET /api/unsubscribe-email
//
// One-click email unsubscribe via HMAC-signed URL.
// Disables email notifications for the specified user.
//
// Query params:
//   uid — Supabase user ID
//   sig — HMAC-SHA256 signature (hex) of the uid, using SUPABASE_SERVICE_ROLE_KEY
//
// Required env vars:
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "crypto";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function verifySig(uid, sig) {
  if (!SUPABASE_SERVICE_KEY || !uid || !sig) return false;
  const expected = createHmac("sha256", SUPABASE_SERVICE_KEY)
    .update(uid)
    .digest("hex");
  try {
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

function htmlPage(title, message, success) {
  const color = success ? "#00F0B5" : "#FF6B6B";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;max-width:460px;padding:40px 24px;">
    <h1 style="color:#00F0B5;font-size:28px;font-weight:800;margin:0 0 8px;letter-spacing:-0.5px;">GigAlertPro</h1>
    <div style="margin:32px 0;padding:24px;background:#0B1120;border:1px solid rgba(255,255,255,0.06);border-radius:12px;">
      <p style="color:${color};font-size:18px;font-weight:700;margin:0 0 12px;">${title}</p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0;">${message}</p>
    </div>
    <a href="https://gigalertpro.com/profile" style="color:#64748b;font-size:13px;text-decoration:underline;">Go to your profile settings</a>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { uid, sig } = req.query || {};

  if (!uid || !sig) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(400)
      .send(
        htmlPage(
          "Invalid Link",
          "This unsubscribe link is missing required parameters.",
          false,
        ),
      );
  }

  if (!verifySig(uid, sig)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(403)
      .send(
        htmlPage(
          "Invalid Link",
          "This unsubscribe link has expired or is invalid.",
          false,
        ),
      );
  }

  // Disable email notifications
  try {
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ email_notifications_enabled: false }),
      },
    );

    if (!patchRes.ok) {
      console.error("[unsubscribe-email] PATCH failed:", patchRes.status);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res
        .status(500)
        .send(
          htmlPage(
            "Something went wrong",
            "We couldn't process your request. Please try again or disable notifications from your profile settings.",
            false,
          ),
        );
    }

    console.info(`[unsubscribe-email] Unsubscribed user ${uid}`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(200)
      .send(
        htmlPage(
          "Unsubscribed",
          "You've been unsubscribed from GigAlertPro email notifications. You can re-enable them anytime from your profile settings.",
          true,
        ),
      );
  } catch (err) {
    console.error("[unsubscribe-email] Error:", err.message);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(500)
      .send(
        htmlPage(
          "Something went wrong",
          "Please try again later or disable notifications from your profile settings.",
          false,
        ),
      );
  }
}
