import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import { useAuth } from "../context/AuthContext";
import { fetchRedditGigs, clearCache } from "./redditClient";
import { notifyNewGigs, seedSeenIds } from "./gigNotifications";
import { useNewGigCount } from "../context/NewGigCountContext";

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DISABLE_AUTH =
  import.meta.env.VITE_DISABLE_AUTH === "true" ||
  !VITE_SUPABASE_URL ||
  VITE_SUPABASE_URL.includes("placeholder") ||
  !VITE_SUPABASE_ANON_KEY;

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
export function useKeywords() {
  const { user } = useAuth();
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

    if (!user) return;
    const { data } = await supabase
      .from("keywords")
      .select("id, keyword")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    setKeywords(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  async function addKeyword(kw) {
    if (!kw || !kw.trim()) return;
    const clean = kw.trim().toLowerCase();

    if (DISABLE_AUTH) {
      if (keywords.some((k) => k.keyword === clean)) return;
      const next = { id: Date.now(), keyword: clean };
      const updated = [...keywords, next];
      setKeywords(updated);
      writeLS("gigalertpro_demo_keywords", updated);
      clearCache();
      return;
    }

    if (!user) return;
    if (keywords.some((k) => k.keyword === clean)) return;
    const { data, error } = await supabase
      .from("keywords")
      .insert({ user_id: user.id, keyword: clean })
      .select("id, keyword")
      .single();
    if (!error && data) setKeywords((prev) => [...prev, data]);
  }

  async function removeKeyword(id) {
    if (DISABLE_AUTH) {
      const updated = keywords.filter((k) => k.id !== id);
      setKeywords(updated);
      writeLS("gigalertpro_demo_keywords", updated);
      clearCache();
      return;
    }
    await supabase.from("keywords").delete().eq("id", id);
    setKeywords((prev) => prev.filter((k) => k.id !== id));
  }

  return {
    keywords,
    loading,
    addKeyword,
    removeKeyword,
    refetch: fetchKeywords,
  };
}

// ── Gig Alerts (matched posts) with keyword filtering + auto-poll ──
export function useGigAlerts(keywordList) {
  const { user } = useAuth();
  const { bump } = useNewGigCount();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef(false);

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
          if (newCount > 0) bump(newCount);
        } else {
          seedSeenIds(results);
        }
        setAlerts(results);
      } catch {
        // On poll failure keep existing results; on first fetch show empty
        if (!pollingRef.current) setAlerts([]);
      }
      setLoading(false);
      return;
    }

    if (!user) return;
    // Fetch gig_alerts that have at least one of the user's keywords
    const kws = (keywordList || []).map((k) =>
      typeof k === "string" ? k : k.keyword,
    );
    if (kws.length === 0) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("gig_alerts")
      .select("*")
      .overlaps("matched_keywords", kws)
      .order("reddit_created", { ascending: false })
      .limit(50);

    const results = data || [];
    if (pollingRef.current) {
      const newCount = notifyNewGigs(results);
      if (newCount > 0) bump(newCount);
    } else {
      seedSeenIds(results);
    }
    setAlerts(results);
    setLoading(false);
  }, [user, keywordList, bump]);

  // Initial fetch + re-fetch when keywords change
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Auto-poll every 2 minutes (cache TTL is also 2 min, so data is fresh)
  useEffect(() => {
    const kws = (keywordList || []).map((k) =>
      typeof k === "string" ? k : k.keyword,
    );
    if (kws.length === 0) return;

    const id = setInterval(() => {
      pollingRef.current = true;
      clearCache();
      fetchAlerts().finally(() => {
        pollingRef.current = false;
      });
    }, 30 * 1000);

    return () => clearInterval(id);
  }, [fetchAlerts, keywordList]);

  return { alerts, loading, refetch: fetchAlerts };
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
    const { data } = await supabase
      .from("proposals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setProposals(data || []);
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

  return {
    proposals,
    loading,
    saveProposal,
    deleteProposal,
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
      .single();
    setProfile(data);
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
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select()
      .single();
    if (!error && data) setProfile(data);
    return { data, error };
  }

  return { profile, loading, updateProfile, refetch: fetchProfile };
}
