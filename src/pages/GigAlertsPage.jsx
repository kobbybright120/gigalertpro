import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import GigCard from "../components/GigCard";
import { useKeywords, useGigAlerts, useProposals } from "../lib/useSupabase";
import { useNewGigCount } from "../context/NewGigCountContext";
import { generateProposal } from "../lib/mockData";

export default function GigAlertsPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [sortBy, setSortBy] = useState("time"); // "time" | "score"

  const { keywords, addKeyword, removeKeyword } = useKeywords();
  const { alerts, loading: alertsLoading } = useGigAlerts(keywords);
  const { saveProposal } = useProposals();
  const { reset: resetGigCount } = useNewGigCount();

  // Derive last-updated time from alert freshness
  const lastUpdated = useMemo(
    () => (alerts.length > 0 && !alertsLoading ? new Date() : null),
    [alerts.length, alertsLoading],
  );

  // Clear the badge whenever the user is on this page
  useEffect(() => {
    resetGigCount();
  }, [resetGigCount]);

  function handleAddKeyword(e) {
    e.preventDefault();
    if (!input.trim()) return;
    addKeyword(input);
    setInput("");
  }

  async function handleGenerateProposal(gig) {
    const text = generateProposal(gig.title);
    await saveProposal({
      gigTitle: gig.title,
      description: gig.budget ? `${gig.source} · ${gig.budget}` : gig.source,
      text,
      alertId: gig.id,
    });
    navigate("/proposals");
  }

  // Filter alerts by source + category, then sort
  let filtered = alerts;
  if (activeFilter !== "all")
    filtered = filtered.filter(
      (a) => a.source_platform?.toLowerCase() === activeFilter,
    );
  if (activeCategory !== "all")
    filtered = filtered.filter(
      (a) => a.category?.toLowerCase() === activeCategory.toLowerCase(),
    );
  if (sortBy === "score")
    filtered = [...filtered].sort((a, b) => (b.score || 0) - (a.score || 0));

  // Count by source
  const redditCount = alerts.filter(
    (a) => a.source_platform === "Reddit",
  ).length;
  const craigslistCount = alerts.filter(
    (a) => a.source_platform === "Craigslist",
  ).length;
  const xCount = alerts.filter(
    (a) => a.source_platform === "X",
  ).length;

  // Collect unique categories from current alerts
  const categorySet = new Set(alerts.map((a) => a.category).filter(Boolean));
  const categories = [...categorySet].sort();

  return (
    <div className="p-5 lg:p-8 space-y-6 max-w-6xl">
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
            Search for gigs and get matched results from 34+ subreddits,
            Craigslist & X/Twitter
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
                  onClick={() => removeKeyword(kwObj.id)}
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
              { key: "all", label: "All", count: alerts.length },
              { key: "reddit", label: "Reddit", count: redditCount },
              {
                key: "craigslist",
                label: "Craigslist",
                count: craigslistCount,
              },
              { key: "x", label: "𝕏 / Twitter", count: xCount },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  activeFilter === key
                    ? "bg-[#00F0B5]/[0.08] text-[#00F0B5] border border-[#00F0B5]/15 shadow-[inset_0_0_0_1px_rgba(0,240,181,0.05)]"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent"
                }`}
              >
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

        {/* Last updated */}
        {lastUpdated && !alertsLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <RefreshCw className="w-3 h-3" />
            Updated{" "}
            {lastUpdated.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
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
                Searching Reddit & Craigslist for gigs matching your keywords
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
              Reddit & Craigslist. Be the first to apply!
            </p>
          </div>
        ) : filtered.length > 0 ? (
          filtered.map((alert) => (
            <GigCard
              key={alert.id}
              gig={{
                id: alert.id,
                title: alert.title,
                body_preview: alert.body_preview || "",
                budget: alert.budget || null,
                source:
                  alert.source_platform === "Reddit"
                    ? `r/${alert.subreddit}`
                    : alert.source_platform === "Craigslist"
                      ? `${alert.author} Craigslist`
                      : `@${alert.author}`,
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
              }}
              onGenerateProposal={handleGenerateProposal}
            />
          ))
        ) : (
          <div className="glass-card rounded-2xl p-14 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-5">
              <AlertCircle className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              No matches yet
            </h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              No gigs matched your keywords right now. New gigs are scanned
              every few minutes — check back soon!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
