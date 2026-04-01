import {
  ExternalLink,
  Sparkles,
  Clock,
  MessageSquare,
  TrendingUp,
  Tag,
  Globe,
  DollarSign,
  ArrowBigUp,
} from "lucide-react";

function ScoreBadge({ score }) {
  let colors, label;
  if (score >= 70) {
    colors =
      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]";
    label = "Hot";
  } else if (score >= 45) {
    colors = "bg-amber-500/10 text-amber-400 border-amber-500/20";
    label = "Good";
  } else {
    colors = "bg-white/[0.04] text-gray-400 border-white/[0.06]";
    label = "New";
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border ${colors}`}
    >
      <TrendingUp className="w-3 h-3" />
      {score} · {label}
    </span>
  );
}

function SourceBadge({ platform }) {
  const config =
    platform === "Reddit"
      ? {
          bg: "bg-orange-500/8 border-orange-500/15 text-orange-400",
          icon: "🔴",
        }
      : { bg: "bg-blue-500/8 border-blue-500/15 text-blue-400", icon: "📋" };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border ${config.bg}`}
    >
      <span className="text-[10px]">{config.icon}</span>
      {platform}
    </span>
  );
}

export default function GigCard({ gig, onGenerateProposal }) {
  const isHot = gig.score >= 70;

  return (
    <div
      className={`glass-card rounded-2xl p-5 sm:p-6 group transition-all duration-300 hover:border-white/10 relative overflow-hidden ${isHot ? "glow-green" : ""}`}
    >
      {/* Hot gig accent bar */}
      {isHot && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#00F0B5] to-[#00D4FF]"></div>
      )}

      {/* Top row: badges */}
      <div className="flex flex-wrap items-center gap-2 mb-3.5">
        {gig.source_platform && <SourceBadge platform={gig.source_platform} />}
        {gig.category && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-500/8 border border-indigo-500/15 text-indigo-400 text-xs font-semibold rounded-lg">
            <Tag className="w-3 h-3" />
            {gig.category}
          </span>
        )}
        {gig.flair && (
          <span className="px-2.5 py-1 bg-purple-500/8 border border-purple-500/15 text-purple-400 text-xs font-medium rounded-lg">
            {gig.flair}
          </span>
        )}
        <div className="ml-auto">
          {gig.score != null && <ScoreBadge score={gig.score} />}
        </div>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-white leading-snug line-clamp-2 text-[15px] group-hover:text-[#00F0B5] transition-colors duration-200">
        {gig.title}
      </h3>

      {/* Body preview */}
      {gig.body_preview && (
        <p className="mt-2 text-sm text-gray-500 leading-relaxed line-clamp-2">
          {gig.body_preview}
        </p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3.5 text-[13px]">
        {gig.budget && gig.budget !== "—" && (
          <span className="inline-flex items-center gap-1 font-bold text-[#00F0B5]">
            <DollarSign className="w-3.5 h-3.5" />
            {String(gig.budget)
              .trim()
              .replace(/^\$+/, "")
              .replace(/\s+/g, " ")}
          </span>
        )}
        <span className="text-gray-500">{gig.source}</span>
        {gig.postedAt && (
          <span className="inline-flex items-center gap-1 text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            {gig.postedAt}
          </span>
        )}
        {gig.upvotes > 0 && (
          <span className="inline-flex items-center gap-1 text-gray-500">
            <ArrowBigUp className="w-3.5 h-3.5" />
            {gig.upvotes}
          </span>
        )}
        {gig.comment_count != null && gig.comment_count > 0 && (
          <span className="inline-flex items-center gap-1 text-gray-500">
            <MessageSquare className="w-3.5 h-3.5" />
            {gig.comment_count}
          </span>
        )}
      </div>

      {/* Matched keywords */}
      {gig.keywords && gig.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3.5">
          {gig.keywords.map((kw) => (
            <span
              key={kw}
              className="px-2 py-0.5 bg-[#00F0B5]/[0.06] border border-[#00F0B5]/10 text-[#00F0B5] text-xs font-medium rounded-md"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2.5 mt-5 pt-4 border-t border-white/[0.04]">
        <a
          href={gig.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#00F0B5] text-[#020617] text-sm font-bold rounded-xl hover:bg-[#00dba5] hover:shadow-[0_0_16px_rgba(0,240,181,0.2)] transition-all duration-200"
        >
          <ExternalLink className="w-4 h-4" />
          Apply Now
        </a>
        <button
          onClick={() => onGenerateProposal(gig)}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-white/[0.04] border border-white/[0.08] text-gray-300 text-sm font-semibold rounded-xl hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-200"
        >
          <Sparkles className="w-4 h-4" />
          Generate Proposal
        </button>
      </div>
    </div>
  );
}
