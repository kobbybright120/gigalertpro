// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Browser Push Notification System
// Shows OS-level notifications when new gigs matching keywords are discovered.
// Works when the tab is open (even in background).
// ─────────────────────────────────────────────────────────────────────────────

const SEEN_KEY = "gigalertpro_seen_gig_ids";
const PERM_KEY = "gigalertpro_notif_enabled";
const MAX_SEEN = 500; // Max IDs to track (prevent unbounded growth)

/** Check if the browser supports notifications */
export function isNotificationSupported() {
  return "Notification" in window;
}

/** Get current permission state: "granted" | "denied" | "default" */
export function getPermission() {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission;
}

/** Whether the user has opted in to notifications */
export function isEnabled() {
  return (
    localStorage.getItem(PERM_KEY) === "true" && getPermission() === "granted"
  );
}

/** Request notification permission and save preference */
export async function requestPermission() {
  if (!isNotificationSupported()) return false;
  const result = await Notification.requestPermission();
  if (result === "granted") {
    localStorage.setItem(PERM_KEY, "true");
    return true;
  }
  return false;
}

/** Disable notifications (user opt-out) */
export function disableNotifications() {
  localStorage.setItem(PERM_KEY, "false");
}

/** Enable notifications (if already granted) */
export function enableNotifications() {
  if (getPermission() === "granted") {
    localStorage.setItem(PERM_KEY, "true");
    return true;
  }
  return false;
}

/** Load the set of previously seen gig IDs from localStorage */
function loadSeenIds() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set();
}

/** Save the set of seen gig IDs */
function saveSeenIds(ids) {
  // Trim to last MAX_SEEN entries to prevent unbounded growth
  const arr = [...ids];
  const trimmed =
    arr.length > MAX_SEEN ? arr.slice(arr.length - MAX_SEEN) : arr;
  localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
}

/**
 * Check a list of gig alerts for NEW ones and fire browser notifications.
 * Returns the count of new gigs notified.
 */
export function notifyNewGigs(alerts) {
  if (!isEnabled() || !alerts || alerts.length === 0) return 0;

  const seen = loadSeenIds();
  const newGigs = alerts.filter((a) => !seen.has(a.id));

  if (newGigs.length === 0) return 0;

  // Mark all current gigs as seen (including old ones)
  for (const a of alerts) seen.add(a.id);
  saveSeenIds(seen);

  // Show notifications for new gigs (max 5 at once to avoid spam)
  const toNotify = newGigs.slice(0, 5);

  if (toNotify.length === 1) {
    // Single gig — detailed notification
    const gig = toNotify[0];
    const scoreLabel =
      gig.score >= 70 ? "🔥 Hot" : gig.score >= 40 ? "⭐ Good" : "New";
    showNotification(`${scoreLabel}: ${gig.title}`, {
      body: `${gig.budget ? gig.budget + " · " : ""}${gig.source_platform || "Reddit"} · ${gig.time_ago || "just now"}`,
      tag: `gig-${gig.id}`,
      data: { url: gig.url },
    });
  } else {
    // Multiple gigs — summary notification
    const top = toNotify[0];
    showNotification(
      `${newGigs.length} new gig${newGigs.length > 1 ? "s" : ""} found!`,
      {
        body: `Top: "${top.title}"${newGigs.length > 1 ? ` + ${newGigs.length - 1} more` : ""}`,
        tag: "gig-batch",
      },
    );
  }

  return newGigs.length;
}

/** Fire a browser notification */
function showNotification(title, options = {}) {
  try {
    const notif = new Notification(title, {
      icon: "/GigAlertAuth.svg?v=20260403",
      badge: "/GigAlertAuth.svg?v=20260403",
      silent: false,
      ...options,
    });

    // Click to open the gig URL or focus the app
    notif.onclick = () => {
      window.focus();
      if (options.data?.url) {
        window.open(options.data.url, "_blank");
      }
      notif.close();
    };

    // Auto-close after 10 seconds
    setTimeout(() => notif.close(), 10000);
  } catch {
    // Notification constructor can throw in some environments
  }
}

/**
 * Seed the seen IDs from current alerts without notifying.
 * Call this on first load so existing gigs don't trigger notifications.
 */
export function seedSeenIds(alerts) {
  if (!alerts || alerts.length === 0) return;
  const seen = loadSeenIds();
  for (const a of alerts) seen.add(a.id);
  saveSeenIds(seen);
}
