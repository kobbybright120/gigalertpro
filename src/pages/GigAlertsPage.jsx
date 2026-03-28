import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, Search, AlertCircle, Loader2, Radar } from "lucide-react";
import GigCard from "../components/GigCard";
import { useKeywords, useGigAlerts, useProposals } from "../lib/useSupabase";
import { generateProposal } from "../lib/mockData";

const MONITORED_COUNT = 10;

export default function GigAlertsPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");

  const {
    keywords,
    loading: kwLoading,
    addKeyword,
    removeKeyword,
  } = useKeywords();
  const { alerts, loading: alertsLoading } = useGigAlerts(keywords);
  const { saveProposal } = useProposals();

  function handleAddKeyword(e) {
    e.preventDefault();
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

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header — matches Dashboard style */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">
            Monitor keywords and find your next client.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#00F0B5]/10 border border-[#00F0B5]/30 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]"></span>
            </span>
            <span className="text-sm font-semibold text-[#00F0B5]">
              System Active
            </span>
          </span>
          <span className="px-4 py-1.5 bg-[#0B1120] border border-white/10 rounded-full text-sm text-gray-400">
            Scanning {MONITORED_COUNT}+ sources
          </span>
        </div>
      </div>

      {/* Two-column layout — same as Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Left: Tracked Keywords */}
        <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-5 self-start">
          <div className="flex items-center gap-2 mb-5">
            <Search className="w-5 h-5 text-gray-400" />
            <h2 className="font-bold text-white">Tracked Keywords</h2>
          </div>

          <form onSubmit={handleAddKeyword} className="flex gap-2 mb-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. React Native..."
              className="flex-1 px-3 py-2.5 bg-[#020617] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[#00F0B5]/40 focus:border-transparent outline-none transition"
            />
            <button
              type="submit"
              className="w-10 h-10 flex items-center justify-center bg-[#00F0B5] text-[#020617] rounded-lg hover:bg-[#00dba5] transition-colors shrink-0"
            >
              <Plus className="w-5 h-5" />
            </button>
          </form>

          <div className="space-y-2">
            {/* All Keywords button */}
            <div className="px-4 py-2.5 bg-[#00F0B5]/10 border border-[#00F0B5]/30 rounded-lg text-[#00F0B5] text-sm font-medium">
              All Keywords
            </div>

            {keywords.map((kwObj) => (
              <div
                key={kwObj.id}
                className="flex items-center justify-between px-4 py-2.5 bg-[#020617] border border-white/5 rounded-lg group"
              >
                <span className="text-sm text-gray-300">{kwObj.keyword}</span>
                <button
                  onClick={() => removeKeyword(kwObj.id)}
                  className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            {keywords.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">
                No keywords added. Type above to start tracking.
              </p>
            )}
          </div>
        </div>

        {/* Right: Latest Opportunities */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">
              Latest Opportunities
            </h2>
            <span className="px-3 py-1 bg-[#0B1120] border border-white/10 rounded-full text-sm text-gray-400">
              {alerts.length} found
            </span>
          </div>

          <div className="grid gap-4">
            {alertsLoading ? (
              <div className="space-y-4">
                {/* Scanning banner */}
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
                    Scanning Reddit...
                  </h3>
                  <p className="text-gray-400 text-sm mt-1">
                    Searching {MONITORED_COUNT} subreddits for gigs matching
                    your keywords
                  </p>
                </div>
                {/* Skeleton cards */}
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
                      <div className="h-4 w-14 bg-white/5 rounded" />
                    </div>
                    <div className="flex gap-2 mt-4">
                      <div className="h-9 w-28 bg-white/5 rounded-lg" />
                      <div className="h-9 w-36 bg-white/5 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : alerts.length > 0 ? (
              alerts.map((alert) => (
                <GigCard
                  key={alert.id}
                  gig={{
                    id: alert.id,
                    title: alert.title,
                    body_preview: alert.body_preview || "",
                    budget: alert.budget || null,
                    source: `r/${alert.subreddit}`,
                    url: alert.url,
                    postedAt:
                      alert.time_ago ||
                      new Date(alert.reddit_created).toLocaleDateString(),
                    keywords: alert.matched_keywords,
                    score: alert.score,
                    category: alert.category,
                    flair: alert.flair,
                    comment_count: alert.comment_count,
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
                  No matches found
                </h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto">
                  We're continuously scanning. When a gig matching your keywords
                  appears, it will show up here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
