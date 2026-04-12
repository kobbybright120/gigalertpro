import { useState, useEffect, useMemo } from "react";
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
  Activity,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import GigCard from "../components/GigCard";
import NotificationToggle from "../components/NotificationToggle";
import ProposalModal from "../components/ProposalModal";
import LockOverlay from "../components/LockOverlay";
import { useLockedDashboard } from "../context/LockedDashboardContext";
import {
  useKeywords,
  useGigAlerts,
  useProposals,
  useProfile,
} from "../lib/useSupabase";
import { supabase } from "../lib/supabase";
import {
  trackKeywordAdded,
  trackKeywordRemoved,
  trackProposalGenerated,
  trackPageViewed,
} from "../lib/umami";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [proposalGig, setProposalGig] = useState(null);

  useEffect(() => {
    trackPageViewed("dashboard");
  }, []);

  const { profile } = useProfile();
  const { keywords, addKeyword, removeKeyword } = useKeywords(profile?.plan);
  const { alerts, loading: alertsLoading } = useGigAlerts(keywords);
  const { saveProposal } = useProposals();
  const {
    isLocked,
    onUpgrade,
    onSeePlans,
    gigCount: lockedGigCount,
    setGigCount,
  } = useLockedDashboard();

  const [keywordError, setKeywordError] = useState("");

  // For locked state, track a dynamic gig count
  const [fetchedGigCount, setFetchedGigCount] = useState(0);
  const realGigCount = lockedGigCount > 0 ? lockedGigCount : fetchedGigCount;

  // Sync real alert count to the banner so numbers match what's actually shown
  useEffect(() => {
    if (isLocked && !alertsLoading && alerts.length > 0) {
      setGigCount(alerts.length);
    }
  }, [isLocked, alertsLoading, alerts.length, setGigCount]);

  useEffect(() => {
    if (!isLocked || lockedGigCount > 0) return;
    // Try to get real count from DB
    async function fetchCount() {
      try {
        const kws = keywords.map((k) => k.keyword);
        if (kws.length === 0) return;
        const twentyFourHoursAgo = new Date(
          Date.now() - 24 * 60 * 60 * 1000,
        ).toISOString();
        const orFilter = kws
          .flatMap((kw) => {
            const safe = kw.replace(/[%_]/g, "\\$&");
            return [`title.ilike.%${safe}%`, `body_preview.ilike.%${safe}%`];
          })
          .join(",");
        const { count } = await supabase
          .from("gig_alerts")
          .select("id", { count: "exact", head: true })
          .or(orFilter)
          .gte("reddit_created", twentyFourHoursAgo);
        if (count > 0) setFetchedGigCount(count);
      } catch {
        // ignore fetch errors
      }
    }
    fetchCount();
  }, [isLocked, keywords, lockedGigCount]);

  // Generate a sample proposal for the first gig when locked
  const bestGig =
    alerts.length > 0
      ? [...alerts].sort((a, b) => (b.score || 0) - (a.score || 0))[0]
      : null;

  const sampleProposalText = useMemo(() => {
    if (!isLocked || !bestGig) return "";
    const skills = profile?.skills?.join(", ") || "your area of expertise";
    return `Hi there,\n\nI came across your post "${bestGig.title}" and I'm excited about this opportunity. With my experience in ${skills}, I'm confident I can deliver exactly what you're looking for.\n\nI've completed similar projects before and can start right away. I'd love to discuss the details and share some relevant work samples.\n\nLooking forward to hearing from you!\n\nBest regards`;
  }, [isLocked, bestGig, profile]);

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
      alertId: null, // client-side gig IDs are strings, not DB BIGINT FKs
    });
    navigate("/proposals");
  }

  // Top 3 gigs for the preview
  const topAlerts = alerts.slice(0, 3);
  const hotCount = alerts.filter((a) => a.score >= 70).length;

  return (
    <div className="p-5 lg:p-8 space-y-6 max-w-6xl">
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Your gig hunting command center
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="inline-flex items-center gap-2 px-4 py-2 glass-card rounded-full border border-[#00F0B5]/15">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]" />
            </span>
            <span className="text-xs font-semibold text-[#00F0B5] tracking-wide">
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
            bg: "bg-gradient-to-br from-[#00F0B5]/10 to-[#00F0B5]/5",
            glow: keywords.length > 0,
          },
          {
            label: "Gigs Found",
            value: alertsLoading ? "..." : alerts.length,
            icon: Bell,
            color: "text-blue-400",
            bg: "bg-gradient-to-br from-blue-400/10 to-blue-400/5",
            glow: false,
          },
          {
            label: "Hot Gigs (70+)",
            value: alertsLoading ? "..." : hotCount,
            icon: TrendingUp,
            color: "text-orange-400",
            bg: "bg-gradient-to-br from-orange-400/10 to-orange-400/5",
            glow: hotCount > 0,
          },
          {
            label: "Sources Scanned",
            value: "37+",
            icon: Globe,
            color: "text-purple-400",
            bg: "bg-gradient-to-br from-purple-400/10 to-purple-400/5",
            glow: false,
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="glass-card rounded-2xl p-5 hover:border-white/10 transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {stat.label}
                </span>
                <div
                  className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center`}
                >
                  <Icon className={`w-[18px] h-[18px] ${stat.color}`} />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-white tracking-tight">
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Notification Toggle + Quick keyword add */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-5">
          <h2 className="font-bold text-white mb-3 flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4 text-[#00F0B5]" />
            Quick Add Keyword
          </h2>
          <form onSubmit={handleAddKeyword} className="flex gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-600" />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. React developer, logo design..."
                className="w-full pl-10 pr-4 py-3 bg-[#020617]/60 border border-white/[0.06] rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-[#00F0B5]/30 focus:border-[#00F0B5]/20 outline-none transition-all duration-200 text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-3 bg-[#00F0B5] text-[#020617] rounded-xl font-bold hover:bg-[#00dba5] hover:shadow-[0_0_16px_rgba(0,240,181,0.2)] transition-all duration-200 shrink-0"
            >
              <Plus className="w-5 h-5" />
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
              phrases like <span className="text-white/70">"logo design"</span>{" "}
              or <span className="text-white/70">"React developer"</span> to get
              better results.
            </p>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
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
        <NotificationToggle />
      </div>

      {/* Gig counter for locked state */}
      {/* Top Gigs Preview */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#00F0B5]" />
            Latest Gigs
          </h2>
          {!isLocked && (
            <Link
              to="/gig-alerts"
              className="group text-sm text-[#00F0B5] hover:text-[#00dba5] transition-colors flex items-center gap-1 font-medium"
            >
              View all {alerts.length} alerts
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>

        <div className="grid gap-4">
          {alertsLoading ? (
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
                Searching Reddit, Craigslist & X/Twitter for gigs matching your
                keywords
              </p>
            </div>
          ) : isLocked && bestGig ? (
            <>
              {/* First gig: fully visible */}
              <GigCard
                key={bestGig.id}
                gig={{
                  id: bestGig.id,
                  title: bestGig.title,
                  body_preview: bestGig.body_preview || "",
                  budget: bestGig.budget || null,
                  source:
                    bestGig.source_platform === "Reddit"
                      ? "Reddit"
                      : bestGig.source_platform === "Craigslist"
                        ? "Craigslist"
                        : bestGig.source_platform || "Reddit",
                  url: bestGig.url,
                  postedAt:
                    bestGig.time_ago ||
                    new Date(bestGig.reddit_created).toLocaleDateString(),
                  keywords: bestGig.matched_keywords,
                  score: bestGig.score,
                  category: bestGig.category,
                  flair: bestGig.flair,
                  comment_count: bestGig.comment_count,
                  upvotes: bestGig.upvotes,
                  source_platform: bestGig.source_platform || "Reddit",
                }}
                onGenerateProposal={handleGenerateProposal}
              />

              {/* Sample AI Proposal for first gig */}
              {sampleProposalText && (
                <div className="glass-card rounded-2xl p-5 glow-green">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00F0B5]/15 to-[#00D4FF]/10 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-[#00F0B5]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        AI-Generated Proposal Preview
                      </h3>
                      <p className="text-xs text-gray-500">
                        For: {bestGig.title}
                      </p>
                    </div>
                  </div>
                  <div className="bg-[#020617]/60 border border-white/[0.06] rounded-xl p-4">
                    <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">
                      {sampleProposalText}
                    </p>
                  </div>
                </div>
              )}

              {/* Locked gigs (blurred) */}
              {alerts.slice(1, 4).map((alert) => (
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
                    }}
                    onGenerateProposal={() => {}}
                  />
                </LockOverlay>
              ))}
            </>
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
                  }}
                  onGenerateProposal={handleGenerateProposal}
                />
              ))}
              {alerts.length > 3 && (
                <Link
                  to="/gig-alerts"
                  className="group block text-center py-4 glass-card rounded-2xl text-[#00F0B5] hover:bg-[#00F0B5]/[0.04] hover:border-[#00F0B5]/15 transition-all duration-200 font-semibold text-sm"
                >
                  View {alerts.length - 3} more gigs
                  <ArrowRight className="inline-block w-4 h-4 ml-1.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              )}
            </>
          ) : keywords.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#00F0B5]/[0.08] flex items-center justify-center mx-auto mb-5">
                <Search className="w-8 h-8 text-[#00F0B5]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                Add your first keyword
              </h3>
              <p className="text-gray-500 text-sm max-w-md mx-auto mb-5">
                Type a skill or role above, then head to Gig Alerts to see all
                matching opportunities.
              </p>
              <Link
                to="/gig-alerts"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#00F0B5] text-[#020617] rounded-xl font-bold hover:bg-[#00dba5] hover:shadow-[0_0_16px_rgba(0,240,181,0.2)] transition-all duration-200 text-sm"
              >
                <Bell className="w-4 h-4" />
                Go to Gig Alerts
              </Link>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-8 h-8 text-gray-600" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                No matches yet
              </h3>
              <p className="text-gray-500 text-sm max-w-md mx-auto">
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
