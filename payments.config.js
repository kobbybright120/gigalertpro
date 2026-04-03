// Toggle to enable/disable payments across the app.
// Supports both client (Vite) and server env vars:
// - Client: set `VITE_PAYMENTS_ENABLED="true"` in your `.env` for vite.
// - Server: set `PAYMENTS_ENABLED="true"` in your deployment env.

const isVite =
  typeof import.meta !== "undefined" && typeof import.meta.env !== "undefined";
const isNode =
  typeof process !== "undefined" && typeof process.env !== "undefined";

export const PAYMENTS_ENABLED =
  (isVite && import.meta.env.VITE_PAYMENTS_ENABLED === "true") ||
  (isNode && process.env.PAYMENTS_ENABLED === "true") ||
  false;
