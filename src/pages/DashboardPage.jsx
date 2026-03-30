import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  AlertCircle,
  X,
  Radar,
  Bell,
  FileText,
  TrendingUp,
  ArrowRight,
  Zap,
  Globe,
} from "lucide-react";
import GigCard from "../components/GigCard";
import NotificationToggle from "../components/NotificationToggle";
import { useKeywords, useGigAlerts, useProposals } from "../lib/useSupabase";
import { generateProposal } from "../lib/mockData";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");

  const { keywords, addKeyword, removeKeyword } = useKeywords();
  const { alerts, loading: alertsLoading } = useGigAlerts(keywords);
  const { proposals } = useProposals();

  function handleAddKeyword(e) {
    e.preventDefault();
    if (!input.trim()) return;
    addKeyword(input);
    setInput("");
  }

  async function handleGenerateProposal(gig) {
    const text = generateProposal(gig.title);
    await proposals.saveProposal?.({
      gigTitle: gig.title,
      description: gig.budget ? `${gig.source} · ${gig.budget}` : gig.source,
      text,
      alertId: gig.id,
    });
    navigate("/proposals");
  }

  // Top 3 gigs for the preview
  const topAlerts = alerts.slice(0, 3);
  const hotCount = alerts.filter((a) => a.score >= 70).length;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">Your gig hunting command center.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#00F0B5]/10 border border-[#00F0B5]/30 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]" />
            </span>
            <span className="text-sm font-semibold text-[#00F0B5]">
              System Active
            </span>
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Keywords Tracked",
            value: keywords.length,
            icon: Search,
            color: "text-[#00F0B5]",
            bg: "bg-[#00F0B5]/10",
          },
          {
            label: "Gigs Found",
            value: alertsLoading ? "..." : alerts.length,
            icon: Bell,
            color: "text-blue-400",
            bg: "bg-blue-400/10",
          },
          {
            label: "Hot Gigs (70+)",
            value: alertsLoading ? "..." : hotCount,
            icon: TrendingUp,
            color: "text-orange-400",
            bg: "bg-orange-400/10",
          },
          {
            label: "Sources",
            value: "34+ subs",
            icon: Globe,
            color: "text-purple-400",
            bg: "bg-purple-400/10",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-[#0B1120] border border-white/5 rounded-2xl p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-400">{stat.label}</span>
                <div
                  className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}
                >
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Notification Toggle + Quick keyword add */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-5">
          <h2 className="font-bold text-white mb-3 flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#00F0B5]" />
            Quick Add Keyword
          </h2>
          <form onSubmit={handleAddKeyword} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. React developer, logo design..."
                className="w-full pl-10 pr-4 py-3 bg-[#020617] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#00F0B5]/40 focus:border-transparent outline-none transition"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-3 bg-[#00F0B5] text-[#020617] rounded-xl font-semibold hover:bg-[#00dba5] transition-colors shrink-0"
            >
              <Plus className="w-5 h-5" />
            </button>
          </form>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
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
        <NotificationToggle />
      </div>

      {/* Top Gigs Preview */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Top Gigs</h2>
          <Link
            to="/gig-alerts"
            className="text-sm text-[#00F0B5] hover:text-[#00dba5] transition-colors flex items-center gap-1"
          >
            View all {alerts.length} alerts
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid gap-4">
          {alertsLoading ? (
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
          ) : topAlerts.length > 0 ? (
            <>
              {topAlerts.map((alert) => (
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
              ))}
              {alerts.length > 3 && (
                <Link
                  to="/gig-alerts"
                  className="block text-center py-4 bg-[#0B1120] border border-white/5 rounded-2xl text-[#00F0B5] hover:bg-[#00F0B5]/5 transition-colors font-medium"
                >
                  View {alerts.length - 3} more gigs →
                </Link>
              )}
            </>
          ) : keywords.length === 0 ? (
            <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-[#00F0B5]/10 flex items-center justify-center mx-auto mb-4">
                <Search className="w-7 h-7 text-[#00F0B5]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                Add your first keyword
              </h3>
              <p className="text-gray-400 text-sm max-w-md mx-auto mb-4">
                Type a skill or role above, then head to Gig Alerts to see all
                matching opportunities.
              </p>
              <Link
                to="/gig-alerts"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00F0B5] text-[#020617] rounded-lg font-semibold hover:bg-[#00dba5] transition-colors"
              >
                <Bell className="w-4 h-4" />
                Go to Gig Alerts
              </Link>
            </div>
          ) : (
            <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-gray-500" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                No matches yet
              </h3>
              <p className="text-gray-400 text-sm max-w-md mx-auto">
                We're continuously scanning. New gigs are checked every few
                minutes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
