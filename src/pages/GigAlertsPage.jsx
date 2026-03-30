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
} from "lucide-react";
import GigCard from "../components/GigCard";
import { useKeywords, useGigAlerts, useProposals } from "../lib/useSupabase";
import { useNewGigCount } from "../context/NewGigCountContext";
import { generateProposal } from "../lib/mockData";

export default function GigAlertsPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const { keywords, addKeyword, removeKeyword } = useKeywords();
  const { alerts, loading: alertsLoading } = useGigAlerts(keywords);
  const { saveProposal } = useProposals();
  const { reset: resetGigCount } = useNewGigCount();

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

  // Filter alerts by source
  const filtered =
    activeFilter === "all"
      ? alerts
      : alerts.filter((a) => a.source_platform?.toLowerCase() === activeFilter);

  // Count by source
  const redditCount = alerts.filter(
    (a) => a.source_platform === "Reddit",
  ).length;
  const craigslistCount = alerts.filter(
    (a) => a.source_platform === "Craigslist",
  ).length;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Bell className="w-8 h-8 text-[#00F0B5]" />
            Gig Alerts
          </h1>
          <p className="text-gray-400 mt-1">
            Search for gigs and get matched results from 34+ subreddits &
            Craigslist.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#00F0B5]/10 border border-[#00F0B5]/30 rounded-full shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]" />
          </span>
          <span className="text-sm font-semibold text-[#00F0B5]">
            Live Scanning
          </span>
        </span>
      </div>

      {/* Search bar — prominent */}
      <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-5">
        <form onSubmit={handleAddKeyword} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search for gigs... e.g. React developer, logo design, video editor"
              className="w-full pl-10 pr-4 py-3 bg-[#020617] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#00F0B5]/40 focus:border-transparent outline-none transition"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-[#00F0B5] text-[#020617] rounded-xl font-semibold hover:bg-[#00dba5] transition-colors shrink-0 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Track
          </button>
        </form>

        {/* Active keyword pills */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {keywords.map((kwObj) => (
              <span
                key={kwObj.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00F0B5]/10 border border-[#00F0B5]/30 rounded-full text-sm text-[#00F0B5]"
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

      {/* Filter tabs + count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          {[
            { key: "all", label: "All", count: alerts.length },
            { key: "reddit", label: "Reddit", count: redditCount },
            { key: "craigslist", label: "Craigslist", count: craigslistCount },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeFilter === key
                  ? "bg-[#00F0B5]/10 text-[#00F0B5] border border-[#00F0B5]/30"
                  : "text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent"
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Results */}
      <div className="grid gap-4">
        {alertsLoading ? (
          <div className="space-y-4">
            <div className="bg-[#0B1120] border border-[#00F0B5]/20 rounded-2xl p-6 text-center">
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
              <p className="text-gray-400 text-sm mt-1">
                Searching Reddit & Craigslist for gigs matching your keywords
              </p>
            </div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-[#0B1120] border border-white/5 rounded-xl p-5 animate-pulse"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-24 bg-white/5 rounded-full" />
                  <div className="h-5 w-16 bg-white/5 rounded-full" />
                </div>
                <div className="h-5 w-3/4 bg-white/5 rounded mb-2" />
                <div className="h-4 w-full bg-white/5 rounded mb-1" />
                <div className="h-4 w-2/3 bg-white/5 rounded mb-3" />
                <div className="flex gap-3">
                  <div className="h-4 w-16 bg-white/5 rounded" />
                  <div className="h-4 w-20 bg-white/5 rounded" />
                </div>
                <div className="flex gap-2 mt-4">
                  <div className="h-9 w-28 bg-white/5 rounded-lg" />
                  <div className="h-9 w-36 bg-white/5 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : keywords.length === 0 ? (
          <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-[#00F0B5]/10 flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7 text-[#00F0B5]" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              Start tracking gigs
            </h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
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
                source_platform: alert.source_platform || "Reddit",
              }}
              onGenerateProposal={handleGenerateProposal}
            />
          ))
        ) : (
          <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-gray-500" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              No matches yet
            </h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              No gigs matched your keywords right now. New gigs are scanned
              every few minutes — check back soon!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
