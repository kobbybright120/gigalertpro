import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  X,
  Search,
  AlertCircle,
  Radar,
  Bell,
  SlidersHorizontal,
  Filter,
  ArrowUpDown,
  Clock,
  TrendingUp,
  RefreshCw,
  Lock,
  Lightbulb,
  Crown,
} from "lucide-react";
import GigCard from "../components/GigCard";
import ProposalModal from "../components/ProposalModal";
import LockOverlay from "../components/LockOverlay";
import { useLockedDashboard } from "../context/LockedDashboardContext";
import {
  useKeywords,
  useGigAlerts,
  useProposals,
  useSavedGigs,
  useProfile,
} from "../lib/useSupabase";
import { useNewGigCount } from "../context/NewGigCountContext";
import {
  trackPageViewed,
  trackKeywordAdded,
  trackKeywordRemoved,
  trackProposalGenerated,
} from "../lib/umami";

/** Format a Unix-ms timestamp as a relative string ("2 min ago") */
function formatUpdated(ts, now) {
  if (!ts || !now) return null;
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return "just now";
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function GigAlertsPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [sortBy, setSortBy] = useState("time"); // "time" | "score"
  const [proposalGig, setProposalGig] = useState(null); // gig selected for AI proposal

  useEffect(() => {
    trackPageViewed("gig_alerts");
  }, []);

  const { profile } = useProfile();
  const { keywords, addKeyword, removeKeyword } = useKeywords(profile?.plan);
  const {
    alerts,
    loading: alertsLoading,
    lastUpdated,
    refetch,
  } = useGigAlerts(keywords);
  const { saveProposal } = useProposals();
  const { savedIds, toggleSave } = useSavedGigs();
  const { reset: resetGigCount } = useNewGigCount();
  const { isLocked, onUpgrade, onSeePlans } = useLockedDashboard();
  const [keywordError, setKeywordError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick every 30 seconds so "Updated X min ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleManualRefresh() {
    setIsRefreshing(true);
    await refetch();
    setNow(Date.now());
    setIsRefreshing(false);
  }

  // Clear the badge whenever the user is on this page
  useEffect(() => {
    resetGigCount();
  }, [resetGigCount]);

  async function handleAddKeyword(e) {
    e.preventDefault();
    if (!input.trim()) return;
    setKeywordError("");
    try {
      await addKeyword(input);
      trackKeywordAdded(input.trim());
      setInput("");
    } catch (err) {
      setKeywordError(err.message);
    }
  }

  function handleGenerateProposal(gig) {
    setProposalGig(gig);
    trackProposalGenerated(gig.id ?? gig.title, gig.source);
  }

  async function handleSaveProposal(text) {
    if (!proposalGig) return;
    await saveProposal({
      gigTitle: proposalGig.title,
      description: proposalGig.budget
        ? `${proposalGig.source} · ${proposalGig.budget}`
        : proposalGig.source || "",
      text,
      alertId: null, // client-side gig IDs don't map to DB gig_alerts.id
    });
    navigate("/proposals");
  }

  // Filter alerts by source + category + gold, then sort
  let filtered = alerts;
  if (activeFilter === "gold")
    filtered = filtered.filter((a) => a.is_gold === true);
  else if (activeFilter !== "all")
    filtered = filtered.filter(
      (a) => a.source_platform?.toLowerCase() === activeFilter,
    );
  if (activeCategory !== "all")
    filtered = filtered.filter(
      (a) => a.category?.toLowerCase() === activeCategory.toLowerCase(),
    );
  if (sortBy === "score")
    filtered = [...filtered].sort((a, b) => (b.score || 0) - (a.score || 0));

  // Count by source + gold
  const goldCount = alerts.filter((a) => a.is_gold === true).length;
  const redditCount = alerts.filter(
    (a) => a.source_platform === "Reddit",
  ).length;
  const craigslistCount = alerts.filter(
    (a) => a.source_platform === "Craigslist",
  ).length;
  const xCount = alerts.filter((a) => a.source_platform === "X").length;
  const threadsCount = alerts.filter(
    (a) => a.source_platform === "Threads",
  ).length;

  // Collect unique categories from current alerts
  const categorySet = new Set(alerts.map((a) => a.category).filter(Boolean));
  const categories = [...categorySet].sort();

  return (
    <div className="p-5 lg:p-8 space-y-6 max-w-6xl">
      {/* AI Proposal Modal */}
      {proposalGig && (
        <ProposalModal
          gig={proposalGig}
          profile={profile}
          onSave={handleSaveProposal}
          onClose={() => setProposalGig(null)}
        />
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F0B5]/15 to-[#00D4FF]/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-[#00F0B5]" />
            </div>
            Gig Alerts
          </h1>
          <p className="text-gray-500 mt-1.5 text-sm">
            Real-time gig matching across Reddit, Craigslist, X & Threads
          </p>
        </div>
        <span className="inline-flex items-center gap-2 px-4 py-2 glass-card rounded-full border border-[#00F0B5]/15 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]" />
          </span>
          <span className="text-xs font-semibold text-[#00F0B5] tracking-wide">
            Live Scanning
          </span>
        </span>
      </div>

      {/* Search bar */}
      <div className="glass-card rounded-2xl p-5">
        <form onSubmit={handleAddKeyword} className="flex gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-600" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search for gigs... e.g. React developer, logo design, video editor"
              className="w-full pl-10 pr-4 py-3 bg-[#020617]/60 border border-white/[0.06] rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-[#00F0B5]/30 focus:border-[#00F0B5]/20 outline-none transition-all duration-200 text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-[#00F0B5] text-[#020617] rounded-xl font-bold hover:bg-[#00dba5] hover:shadow-[0_0_16px_rgba(0,240,181,0.2)] transition-all duration-200 shrink-0 flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Track
          </button>
        </form>
        {keywordError && (
          <p className="text-red-400 text-xs mt-2">{keywordError}</p>
        )}
        {/* Keyword tip */}
        <div className="flex items-start gap-2 px-3 py-2 mt-2.5 rounded-xl bg-[#00F0B5]/[0.04] border border-[#00F0B5]/10">
          <Lightbulb className="w-3.5 h-3.5 text-[#00F0B5] mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-gray-400">
            <span className="text-[#00F0B5] font-medium">Tip:</span> Use clear
            keywords like <span className="text-white/70">Shopify</span>,{" "}
            <span className="text-white/70">React</span>,{" "}
            <span className="text-white/70">WordPress</span> or full task
            phrases like <span className="text-white/70">"logo design"</span> or{" "}
            <span className="text-white/70">"React developer"</span> to get
            better results.
          </p>
        </div>

        {/* Active keyword pills */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {keywords.map((kwObj) => (
              <span
                key={kwObj.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00F0B5]/[0.06] border border-[#00F0B5]/15 rounded-lg text-sm text-[#00F0B5] font-medium"
              >
                {kwObj.keyword}
                <button
                  onClick={() => {
                    trackKeywordRemoved(kwObj.keyword);
                    removeKeyword(kwObj.id);
                  }}
                  className="hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Filter tabs + sort + count */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {[
              { key: "all", label: "All", count: alerts.length, locked: false },
              {
                key: "gold",
                label: "⭐ Gold Leads",
                count: goldCount,
                locked: false,
                gold: true,
              },
              {
                key: "reddit",
                label: "Reddit",
                count: redditCount,
                locked: false,
              },
              {
                key: "craigslist",
                label: "Craigslist",
                count: craigslistCount,
                locked: false,
              },
              {
                key: "x",
                label: "𝕏 / Twitter",
                count: xCount,
                locked: isLocked,
              },
              {
                key: "threads",
                label: "Threads",
                count: threadsCount,
                locked: isLocked,
              },
            ].map(({ key, label, count, locked, gold }) => (
              <button
                key={key}
                onClick={() => {
                  if (locked) {
                    onUpgrade?.();
                    return;
                  }
                  setActiveFilter(key);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 relative ${
                  locked
                    ? "text-gray-600 border border-white/[0.04] cursor-pointer hover:border-[#00F0B5]/15"
                    : activeFilter === key && gold
                      ? "bg-yellow-500/[0.1] text-yellow-400 border border-yellow-500/20 shadow-[inset_0_0_0_1px_rgba(234,179,8,0.05)]"
                      : activeFilter === key
                        ? "bg-[#00F0B5]/[0.08] text-[#00F0B5] border border-[#00F0B5]/15 shadow-[inset_0_0_0_1px_rgba(0,240,181,0.05)]"
                        : gold
                          ? "text-yellow-500/70 hover:text-yellow-400 hover:bg-yellow-500/[0.05] border border-transparent"
                          : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent"
                }`}
              >
                {locked && (
                  <Lock className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                )}
                {label} ({count})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {/* Sort toggle */}
            <div className="flex items-center gap-1 glass-card rounded-lg p-0.5">
              <button
                onClick={() => setSortBy("time")}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                  sortBy === "time"
                    ? "bg-[#00F0B5]/[0.1] text-[#00F0B5]"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Clock className="w-3 h-3" />
                Newest
              </button>
              <button
                onClick={() => setSortBy("score")}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                  sortBy === "score"
                    ? "bg-[#00F0B5]/[0.1] text-[#00F0B5]"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                Top Score
              </button>
            </div>
            <span className="text-xs text-gray-600 font-medium">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Category filter pills */}
        {categories.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="w-3.5 h-3.5 text-gray-600 shrink-0" />
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                activeCategory === "all"
                  ? "bg-indigo-500/[0.1] text-indigo-400 border border-indigo-500/15"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              All Categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                  activeCategory === cat
                    ? "bg-indigo-500/[0.1] text-indigo-400 border border-indigo-500/15"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Last updated + refresh */}
        {!alertsLoading && (
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-600">
                Updated {formatUpdated(lastUpdated, now)}
              </span>
            )}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 glass-card rounded-lg text-xs font-semibold text-gray-400 hover:text-[#00F0B5] border border-white/[0.04] hover:border-[#00F0B5]/20 transition-all duration-200 disabled:opacity-50"
              title="Refresh gigs"
            >
              <RefreshCw
                className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="grid gap-4">
        {alertsLoading ? (
          <div className="space-y-4">
            <div className="glass-card glow-green rounded-2xl p-8 text-center">
              <div className="relative w-14 h-14 mx-auto mb-4">
                <Radar
                  className="w-14 h-14 text-[#00F0B5] animate-spin"
                  style={{ animationDuration: "3s" }}
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-3 h-3 rounded-full bg-[#00F0B5] animate-ping" />
                </span>
              </div>
              <h3 className="text-white font-bold text-lg">
                Scanning Sources...
              </h3>
              <p className="text-gray-500 text-sm mt-1">
                Searching Reddit, Craigslist, X & Threads for matching gigs
              </p>
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-20 rounded-lg animate-shimmer" />
                  <div className="h-6 w-16 rounded-lg animate-shimmer" />
                </div>
                <div className="h-5 w-3/4 rounded-lg animate-shimmer mb-2" />
                <div className="h-4 w-full rounded-lg animate-shimmer mb-1" />
                <div className="h-4 w-2/3 rounded-lg animate-shimmer mb-4" />
                <div className="flex gap-3">
                  <div className="h-4 w-16 rounded-lg animate-shimmer" />
                  <div className="h-4 w-20 rounded-lg animate-shimmer" />
                </div>
                <div className="flex gap-2.5 mt-5 pt-4 border-t border-white/[0.04]">
                  <div className="h-10 w-28 rounded-xl animate-shimmer" />
                  <div className="h-10 w-36 rounded-xl animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : keywords.length === 0 ? (
          <div className="glass-card rounded-2xl p-14 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#00F0B5]/[0.08] flex items-center justify-center mx-auto mb-5">
              <Search className="w-8 h-8 text-[#00F0B5]" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              Start tracking gigs
            </h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Type a keyword or skill above to start finding matching gigs from
              Reddit, Craigslist, X & Threads. Be the first to apply!
            </p>
          </div>
        ) : filtered.length > 0 ? (
          filtered.map((alert, index) => {
            // In locked state: first gig is visible, rest are locked
            if (isLocked && index > 0) {
              return (
                <LockOverlay
                  key={alert.id}
                  onUpgrade={onUpgrade}
                  onSeePlans={onSeePlans}
                >
                  <GigCard
                    gig={{
                      id: alert.id,
                      title: alert.title,
                      body_preview: alert.body_preview || "",
                      budget: alert.budget || null,
                      source: alert.source_platform || "Reddit",
                      url: alert.url,
                      postedAt:
                        alert.time_ago ||
                        new Date(alert.reddit_created).toLocaleDateString(),
                      keywords: alert.matched_keywords,
                      score: alert.score,
                      category: alert.category,
                      flair: alert.flair,
                      comment_count: alert.comment_count,
                      upvotes: alert.upvotes,
                      source_platform: alert.source_platform || "Reddit",
                      location: alert.location || null,
                      is_gold: alert.is_gold,
                      quality_score: alert.quality_score,
                      clean_summary: alert.clean_summary,
                      extracted_budget: alert.extracted_budget,
                      filter_reason: alert.filter_reason,
                    }}
                    onGenerateProposal={() => {}}
                  />
                </LockOverlay>
              );
            }
            return (
              <GigCard
                key={alert.id}
                gig={{
                  id: alert.id,
                  title: alert.title,
                  body_preview: alert.body_preview || "",
                  budget: alert.budget || null,
                  source:
                    alert.source_platform === "Reddit"
                      ? "Reddit"
                      : alert.source_platform === "Craigslist"
                        ? "Craigslist"
                        : alert.source_platform || "Reddit",
                  url: alert.url,
                  postedAt:
                    alert.time_ago ||
                    new Date(alert.reddit_created).toLocaleDateString(),
                  keywords: alert.matched_keywords,
                  score: alert.score,
                  category: alert.category,
                  flair: alert.flair,
                  comment_count: alert.comment_count,
                  upvotes: alert.upvotes,
                  source_platform: alert.source_platform || "Reddit",
                  location: alert.location || null,
                  is_gold: alert.is_gold,
                  quality_score: alert.quality_score,
                  clean_summary: alert.clean_summary,
                  extracted_budget: alert.extracted_budget,
                  filter_reason: alert.filter_reason,
                }}
                onGenerateProposal={
                  isLocked && index > 0
                    ? () => onUpgrade?.()
                    : handleGenerateProposal
                }
                onSaveGig={(gig) => toggleSave(gig.id)}
                isSaved={savedIds.has(alert.id)}
              />
            );
          })
        ) : (
          <div className="glass-card rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-5">
              <AlertCircle className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              No matches yet
            </h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto mb-5">
              No gigs found for your keywords right now. Gigs refresh every few
              minutes. Try a broader term:
            </p>
            {/* Keyword suggestions based on what's tracked */}
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                "react developer",
                "python",
                "logo design",
                "video editor",
                "seo",
                "virtual assistant",
                "copywriting",
                "data entry",
                "wordpress",
                "shopify",
              ]
                .filter(
                  (s) =>
                    !keywords.some(
                      (k) =>
                        k.keyword === s ||
                        s.includes(k.keyword) ||
                        k.keyword.includes(s),
                    ),
                )
                .slice(0, 6)
                .map((sug) => (
                  <button
                    key={sug}
                    onClick={async () => {
                      try {
                        await addKeyword(sug);
                      } catch (err) {
                        setKeywordError(err.message);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00F0B5]/[0.06] border border-[#00F0B5]/15 text-[#00F0B5] hover:bg-[#00F0B5]/[0.12] transition-colors"
                  >
                    + {sug}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
