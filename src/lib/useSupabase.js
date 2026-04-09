import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "./supabase";
import { useAuth } from "../context/AuthContext";
import { fetchRedditGigs, clearCache, getCacheTimestamp } from "./redditClient";
import { notifyNewGigs, seedSeenIds } from "./gigNotifications";
import { useNewGigCount } from "../context/NewGigCountContext";

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DISABLE_AUTH =
  import.meta.env.VITE_DISABLE_AUTH === "true" ||
  !VITE_SUPABASE_URL ||
  VITE_SUPABASE_URL.includes("placeholder") ||
  !VITE_SUPABASE_ANON_KEY;

/** Return "2h ago", "3d ago", etc. from an ISO timestamp or UTC seconds */
function timeAgo(input) {
  if (!input) return "";
  const then =
    typeof input === "number" ? input * 1000 : new Date(input).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// LocalStorage helpers for demo (when auth is disabled)
function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // ignore
  }
}

// ── Keywords ──
const KEYWORD_LIMITS = { basic: 5, pro: 20, agency: Infinity };

export function useKeywords(plan) {
  const { user } = useAuth();
  const userId = user?.id;
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchKeywords = useCallback(async () => {
    if (DISABLE_AUTH) {
      const demo = readLS("gigalertpro_demo_keywords", null);
      if (demo) setKeywords(demo);
      else {
        const starter = [
          { id: 1, keyword: "react" },
          { id: 2, keyword: "logo design" },
        ];
        setKeywords(starter);
        writeLS("gigalertpro_demo_keywords", starter);
      }
      setLoading(false);
      return;
    }

    if (!userId) return;
    const { data } = await supabase
      .from("keywords")
      .select("id, keyword")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    setKeywords(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  async function addKeyword(kw) {
    if (!kw || !kw.trim()) return;
    const clean = kw.trim().toLowerCase();

    if (DISABLE_AUTH) {
      setKeywords((prev) => {
        if (prev.some((k) => k.keyword === clean)) return prev;
        const next = { id: Date.now(), keyword: clean };
        const updated = [...prev, next];
        writeLS("gigalertpro_demo_keywords", updated);
        return updated;
      });
      clearCache();
      return;
    }

    if (!userId) return;
    if (keywords.some((k) => k.keyword === clean)) return;

    // Enforce keyword limit based on plan
    const limit = KEYWORD_LIMITS[plan] ?? 0;
    if (keywords.length >= limit) {
      throw new Error(
        `Keyword limit reached (${limit}). Upgrade your plan to add more.`,
      );
    }

    // Optimistic: show keyword instantly with a temp id
    const tempId = `temp_${Date.now()}`;
    const optimistic = { id: tempId, keyword: clean };
    setKeywords((prev) => [...prev, optimistic]);
    clearCache();

    const { data, error } = await supabase
      .from("keywords")
      .insert({ user_id: userId, keyword: clean })
      .select("id, keyword")
      .single();
    if (!error && data) {
      // Replace temp entry with real DB row
      setKeywords((prev) => prev.map((k) => (k.id === tempId ? data : k)));
    } else {
      // Roll back on failure
      setKeywords((prev) => prev.filter((k) => k.id !== tempId));
    }
  }

  async function removeKeyword(id) {
    if (DISABLE_AUTH) {
      setKeywords((prev) => {
        const updated = prev.filter((k) => k.id !== id);
        writeLS("gigalertpro_demo_keywords", updated);
        return updated;
      });
      clearCache();
      return;
    }
    // Optimistic: remove instantly, restore on failure
    const removed = keywords.find((k) => k.id === id);
    setKeywords((prev) => prev.filter((k) => k.id !== id));
    clearCache();

    const { error } = await supabase
      .from("keywords")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      console.error("Failed to delete keyword:", error.message);
      if (removed) setKeywords((prev) => [...prev, removed]);
    }
  }

  return {
    keywords,
    loading,
    addKeyword,
    removeKeyword,
    refetch: fetchKeywords,
  };
}

// Adaptive poll intervals: back off gradually when no new gigs are found
const POLL_INTERVALS = [
  2 * 60 * 1000, // 2 min  (normal — fresh keywords / just got new gigs)
  4 * 60 * 1000, // 4 min  (quiet — nothing new after 2 polls)
  8 * 60 * 1000, // 8 min  (very quiet — nothing new after 4 polls)
  10 * 60 * 1000, // 10 min (idle — max backoff)
];

// ── Gig Alerts (matched posts) with keyword filtering + auto-poll ──
export function useGigAlerts(keywordList) {
  const { user } = useAuth();
  const userId = user?.id;
  const { bump } = useNewGigCount();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(() => getCacheTimestamp());
  const pollingRef = useRef(false);
  const pollMissesRef = useRef(0); // consecutive polls with no new gigs

  const fetchAlerts = useCallback(async () => {
    // Only show skeleton on the first/keyword-change fetch, not on polls
    if (!pollingRef.current) setLoading(true);

    // Demo mode: fetch real Reddit posts by keywords
    if (DISABLE_AUTH) {
      const kws = (keywordList || []).map((k) =>
        typeof k === "string" ? k : k.keyword,
      );
      if (kws.length === 0) {
        setAlerts([]);
        setLoading(false);
        return;
      }
      try {
        const results = await fetchRedditGigs(kws);
        // On first load, seed seen IDs; on polls, notify new gigs
        if (pollingRef.current) {
          const newCount = notifyNewGigs(results);
          if (newCount > 0) {
            bump(newCount);
            pollMissesRef.current = 0; // reset backoff — fresh gigs found
          } else {
            pollMissesRef.current = Math.min(
              pollMissesRef.current + 1,
              POLL_INTERVALS.length - 1,
            );
          }
        } else {
          seedSeenIds(results);
        }
        setAlerts(results);
        setLastUpdated(Date.now());
      } catch {
        // On poll failure keep existing results; on first fetch show empty
        if (!pollingRef.current) setAlerts([]);
      }
      setLoading(false);
      return;
    }

    if (!userId) {
      if (!pollingRef.current) setLoading(false);
      return;
    }
    // Fetch gig alerts: use Vercel proxy (redditClient) for live Reddit data,
    // then persist to Supabase for history. The edge function can't reach Reddit
    // from cloud IPs, so the frontend fetches via the proxy instead.
    const kws = (keywordList || []).map((k) =>
      typeof k === "string" ? k : k.keyword,
    );
    if (kws.length === 0) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch live from Reddit via Vercel proxy (same as demo mode)
      const liveResults = await fetchRedditGigs(kws);

      // Persist each result to Supabase in the background (fire-and-forget)
      if (liveResults.length > 0) {
        const rows = liveResults.map((r) => ({
          reddit_post_id: r.reddit_post_id || r.id,
          title: r.title || "Untitled",
          body_preview: (r.body_preview || "").slice(0, 500),
          url: r.url || "",
          subreddit: r.subreddit || "",
          budget: r.budget || null,
          author: r.author || null,
          reddit_created: r.reddit_created || new Date().toISOString(),
          matched_keywords: r.matched_keywords || r.keywords || [],
          score: r.score ?? 0,
          comment_count: r.comment_count ?? 0,
          upvotes: r.upvotes ?? 0,
          flair: r.flair || null,
          category: r.category || null,
          source:
            r.source_platform === "X"
              ? "x"
              : r.source_platform === "Craigslist"
                ? "craigslist"
                : "reddit",
        }));
        supabase
          .from("gig_alerts")
          .upsert(rows, { onConflict: "reddit_post_id" })
          .then(({ error }) => {
            if (error)
              console.warn("[GigAlertPro] gig_alerts upsert:", error.message);
          });
      }

      if (pollingRef.current) {
        const newCount = notifyNewGigs(liveResults);
        if (newCount > 0) {
          bump(newCount);
          pollMissesRef.current = 0;
        } else {
          pollMissesRef.current = Math.min(
            pollMissesRef.current + 1,
            POLL_INTERVALS.length - 1,
          );
        }
      } else {
        seedSeenIds(liveResults);
      }
      setAlerts(liveResults);
      setLastUpdated(Date.now());
    } catch (err) {
      console.warn("[GigAlertPro] Live fetch failed, falling back to DB:", err);
      // Fallback: read from Supabase if the proxy is unavailable
      const orFilter = kws
        .flatMap((kw) => {
          const safe = kw.replace(/[%_]/g, "\\$&");
          return [`title.ilike.%${safe}%`, `body_preview.ilike.%${safe}%`];
        })
        .join(",");

      const { data } = await supabase
        .from("gig_alerts")
        .select("*")
        .or(orFilter)
        .order("reddit_created", { ascending: false })
        .limit(50);

      const results = (data || []).map((row) => ({
        ...row,
        source: row.author ? `@${row.author}` : "",
        source_platform: "Reddit",
        postedAt: row.reddit_created ? timeAgo(row.reddit_created) : "",
        keywords: row.matched_keywords || [],
        score: row.score ?? 0,
        category: row.category || null,
        flair: row.flair || null,
        comment_count: row.comment_count ?? 0,
        upvotes: row.upvotes ?? 0,
      }));
      if (pollingRef.current) {
        const newCount = notifyNewGigs(results);
        if (newCount > 0) bump(newCount);
      } else {
        seedSeenIds(results);
      }
      setAlerts(results);
      setLastUpdated(Date.now());
    }
    setLoading(false);
  }, [userId, keywordList, bump]);

  // Initial fetch + re-fetch when keywords change
  useEffect(() => {
    // Don't attempt to fetch until auth is initialized (unless demo mode)
    if (!DISABLE_AUTH && !userId) return;
    fetchAlerts();
  }, [fetchAlerts, DISABLE_AUTH, userId]);

  // Auto-poll with adaptive backoff — pauses when tab is hidden, resumes + fetches on tab return
  // Interval starts at 2 min, backs off to 10 min when no new gigs are found
  useEffect(() => {
    const kws = (keywordList || []).map((k) =>
      typeof k === "string" ? k : k.keyword,
    );
    if (kws.length === 0) return;

    let intervalId = null;

    function startPolling() {
      if (intervalId) return;
      // Pick interval based on how many polls had no new gigs
      const ms =
        POLL_INTERVALS[
          Math.min(pollMissesRef.current, POLL_INTERVALS.length - 1)
        ];
      intervalId = setInterval(() => {
        pollingRef.current = true;
        clearCache();
        fetchAlerts().finally(() => {
          pollingRef.current = false;
          // Restart with updated interval after each poll (adaptive backoff)
          stopPolling();
          startPolling();
        });
      }, ms);
    }

    function stopPolling() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    // Visibility handler: pause when hidden, resume + immediate fetch when visible
    function handleVisibility() {
      if (document.hidden) {
        stopPolling();
      } else {
        // Tab is back — immediately fetch fresh data then resume polling
        pollingRef.current = true;
        clearCache();
        fetchAlerts().finally(() => {
          pollingRef.current = false;
        });
        startPolling();
      }
    }

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchAlerts, keywordList]);

  return { alerts, loading, lastUpdated, refetch: fetchAlerts };
}

// ── User Alert Notifications (unread count + list) ──
export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (DISABLE_AUTH) {
      const demo = readLS("gigalertpro_demo_notifications", []);
      setNotifications(demo);
      setUnreadCount(demo.filter((n) => !n.is_read).length);
      return;
    }

    if (!user) return;
    const { data } = await supabase
      .from("user_alerts")
      .select("id, is_read, dismissed, created_at, alert:gig_alerts(*)")
      .eq("user_id", user.id)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(30);

    const items = data || [];
    setNotifications(items);
    setUnreadCount(items.filter((n) => !n.is_read).length);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to Realtime inserts on user_alerts for this user
  useEffect(() => {
    if (DISABLE_AUTH) return; // demo mode has no realtime
    if (!user) return;
    const channel = supabase
      .channel("user-alerts-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_alerts",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Refetch to get the joined alert data
          fetchNotifications();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  async function markAsRead(notifId) {
    if (DISABLE_AUTH) {
      const updated = notifications.map((n) =>
        n.id === notifId ? { ...n, is_read: true } : n,
      );
      setNotifications(updated);
      setUnreadCount(updated.filter((n) => !n.is_read).length);
      writeLS("gigalertpro_demo_notifications", updated);
      return;
    }

    await supabase
      .from("user_alerts")
      .update({ is_read: true })
      .eq("id", notifId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    if (DISABLE_AUTH) {
      const updated = notifications.map((n) => ({ ...n, is_read: true }));
      setNotifications(updated);
      setUnreadCount(0);
      writeLS("gigalertpro_demo_notifications", updated);
      return;
    }
    if (!user) return;
    await supabase
      .from("user_alerts")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  async function dismiss(notifId) {
    if (DISABLE_AUTH) {
      const updated = notifications.filter((n) => n.id !== notifId);
      setNotifications(updated);
      setUnreadCount(updated.filter((n) => !n.is_read).length);
      writeLS("gigalertpro_demo_notifications", updated);
      return;
    }

    await supabase
      .from("user_alerts")
      .update({ dismissed: true })
      .eq("id", notifId);
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllRead,
    dismiss,
    refetch: fetchNotifications,
  };
}

// ── Proposals (saved AI pitches) ──
export function useProposals() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProposals = useCallback(async () => {
    if (DISABLE_AUTH) {
      const demo = readLS("gigalertpro_demo_proposals", []);
      setProposals(demo);
      setLoading(false);
      return;
    }
    if (!user) return;
    const { data, error } = await supabase
      .from("proposals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      // eslint-disable-next-line no-console
      console.error(
        "[useProposals] supabase error:",
        JSON.stringify(
          {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            status: error.status,
          },
          null,
          2,
        ),
      );
      setProposals([]);
    } else {
      setProposals(data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  async function saveProposal({ gigTitle, description, text, alertId }) {
    if (DISABLE_AUTH) {
      const newP = {
        id: Date.now(),
        user_id: "demo",
        alert_id: alertId || null,
        gig_title: gigTitle,
        description: description || "",
        text,
        created_at: new Date().toISOString(),
      };
      const updated = [newP, ...proposals];
      setProposals(updated);
      writeLS("gigalertpro_demo_proposals", updated);
      return { data: newP, error: null };
    }
    if (!user) return;
    const { data, error } = await supabase
      .from("proposals")
      .insert({
        user_id: user.id,
        gig_title: gigTitle,
        description: description || "",
        text,
        alert_id: alertId || null,
      })
      .select()
      .single();
    if (!error && data) setProposals((prev) => [data, ...prev]);
    return { data, error };
  }

  async function deleteProposal(id) {
    if (DISABLE_AUTH) {
      const updated = proposals.filter((p) => p.id !== id);
      setProposals(updated);
      writeLS("gigalertpro_demo_proposals", updated);
      return;
    }
    await supabase.from("proposals").delete().eq("id", id);
    setProposals((prev) => prev.filter((p) => p.id !== id));
  }

  async function saveOutcome(id, outcome) {
    if (DISABLE_AUTH) {
      const updated = proposals.map((p) =>
        p.id === id ? { ...p, outcome } : p,
      );
      setProposals(updated);
      writeLS("gigalertpro_demo_proposals", updated);
      return;
    }
    await supabase.from("proposals").update({ outcome }).eq("id", id);
    setProposals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, outcome } : p)),
    );
  }

  return {
    proposals,
    loading,
    saveProposal,
    deleteProposal,
    saveOutcome,
    refetch: fetchProposals,
  };
}

// ── Profile ──
export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (DISABLE_AUTH) {
      const demo = readLS("gigalertpro_demo_profile", null);
      if (demo) setProfile(demo);
      else {
        const p = {
          id: "demo",
          name: "Demo User",
          bio: "Freelancer demo profile",
          skills: ["React", "Design"],
          testimonials: ["Great work!"],
          portfolio_links: ["https://example.com"],
          hourly_rate: 50,
          availability: "available",
        };
        setProfile(p);
        writeLS("gigalertpro_demo_profile", p);
      }
      setLoading(false);
      return;
    }

    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    // Merge auth email in case the profiles row predates the email column
    setProfile(data ? { ...data, email: data.email || user.email } : null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  async function updateProfile(updates) {
    if (DISABLE_AUTH) {
      const updated = { ...profile, ...updates };
      setProfile(updated);
      writeLS("gigalertpro_demo_profile", updated);
      return { data: updated, error: null };
    }
    if (!user) return { data: null, error: { message: "Not authenticated" } };

    const payload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Use RPC (SECURITY DEFINER) so RLS cannot silently block the write
    const { data, error } = await supabase.rpc("upsert_profile", {
      p_name: payload.name ?? "",
      p_bio: payload.bio ?? "",
      p_skills: payload.skills ?? [],
      p_testimonials: payload.testimonials ?? [],
      p_portfolio_links: payload.portfolio_links ?? [],
      p_email: user.email ?? null,
    });

    if (error) {
      console.error("[useProfile] rpc upsert_profile failed:", error);
      return { data: null, error };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      setProfile(row);
    }
    return { data: row, error: null };
  }

  return { profile, loading, updateProfile, refetch: fetchProfile };
}

// ── Saved Gigs ──
export function useSavedGigs() {
  const { user } = useAuth();
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSaved = useCallback(async () => {
    if (DISABLE_AUTH) {
      const demo = readLS("gigalertpro_demo_saved", []);
      setSaved(demo);
      setLoading(false);
      return;
    }
    if (!user) return;
    const { data } = await supabase
      .from("saved_gigs")
      .select("alert_id")
      .eq("user_id", user.id);
    setSaved((data || []).map((d) => d.alert_id));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  const savedIds = useMemo(() => new Set(saved), [saved]);

  async function toggleSave(alertId) {
    if (DISABLE_AUTH) {
      setSaved((prev) => {
        const next = prev.includes(alertId)
          ? prev.filter((id) => id !== alertId)
          : [...prev, alertId];
        writeLS("gigalertpro_demo_saved", next);
        return next;
      });
      return;
    }
    if (!user) return;
    if (savedIds.has(alertId)) {
      await supabase
        .from("saved_gigs")
        .delete()
        .eq("user_id", user.id)
        .eq("alert_id", alertId);
      setSaved((prev) => prev.filter((id) => id !== alertId));
    } else {
      await supabase
        .from("saved_gigs")
        .insert({ user_id: user.id, alert_id: alertId });
      setSaved((prev) => [...prev, alertId]);
    }
  }

  return { saved, savedIds, toggleSave, loading };
}
