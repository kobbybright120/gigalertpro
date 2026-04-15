// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/verify-turnstile
//
// Validates a Cloudflare Turnstile token server-side before allowing
// authentication actions. Returns { success: true } or { success: false }.
// ─────────────────────────────────────────────────────────────────────────────

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  if (!TURNSTILE_SECRET_KEY) {
    console.error("[verify-turnstile] TURNSTILE_SECRET_KEY is not configured");
    return res
      .status(500)
      .json({ success: false, error: "Turnstile not configured" });
  }

  const { token } = req.body || {};
  if (!token || typeof token !== "string") {
    return res
      .status(400)
      .json({ success: false, error: "Missing Turnstile token" });
  }

  if (token.length > 2048) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid Turnstile token" });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const formData = new URLSearchParams();
    formData.append("secret", TURNSTILE_SECRET_KEY);
    formData.append("response", token);

    // Forward client IP if available for additional validation
    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.headers["x-real-ip"] ||
      req.socket?.remoteAddress;
    if (clientIp) {
      formData.append("remoteip", clientIp);
    }

    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json();

    if (result.success) {
      return res.status(200).json({ success: true });
    }

    console.warn(
      "[verify-turnstile] Verification failed:",
      result["error-codes"],
    );
    return res.status(403).json({
      success: false,
      error: "Turnstile verification failed",
    });
  } catch (err) {
    console.error("[verify-turnstile] Error:", err.message);
    return res
      .status(500)
      .json({ success: false, error: "Verification service error" });
  }
}
