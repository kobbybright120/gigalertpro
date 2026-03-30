import {
  ExternalLink,
  Sparkles,
  Clock,
  MessageSquare,
  TrendingUp,
  Tag,
  Globe,
} from "lucide-react";

function ScoreBadge({ score }) {
  let color, label;
  if (score >= 70) {
    color = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    label = "Hot";
  } else if (score >= 45) {
    color = "bg-amber-500/20 text-amber-400 border-amber-500/30";
    label = "Good";
  } else {
    color = "bg-gray-500/20 text-gray-400 border-gray-500/30";
    label = "New";
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full border ${color}`}
    >
      <TrendingUp className="w-3 h-3" />
      {score} — {label}
    </span>
  );
}

export default function GigCard({ gig, onGenerateProposal }) {
  return (
    <div className="bg-[#0B1120] border border-white/5 rounded-xl p-5 hover:border-[#00F0B5]/20 transition-colors group">
      {/* Top row: category + score + time */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {gig.category && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 text-xs font-semibold rounded-full">
              <Tag className="w-3 h-3" />
              {gig.category}
            </span>
          )}
          {gig.flair && (
            <span className="px-2 py-0.5 bg-purple-500/15 border border-purple-500/25 text-purple-400 text-xs font-medium rounded-full">
              {gig.flair}
            </span>
          )}
          {gig.source_platform && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full border ${
                gig.source_platform === "Reddit"
                  ? "bg-orange-500/15 border-orange-500/30 text-orange-400"
                  : "bg-blue-500/15 border-blue-500/30 text-blue-400"
              }`}
            >
              <Globe className="w-3 h-3" />
              {gig.source_platform}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
          {gig.score != null && <ScoreBadge score={gig.score} />}
        </div>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-white leading-snug line-clamp-2">
        {gig.title}
      </h3>

      {/* Body preview */}
      {gig.body_preview && (
        <p className="mt-2 text-sm text-gray-400 leading-relaxed line-clamp-2">
          {gig.body_preview}
        </p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
        {gig.budget && gig.budget !== "—" && (
          <span className="inline-flex items-center gap-1 font-bold text-[#00F0B5]">
            {gig.budget}
          </span>
        )}
        <span className="text-gray-500">{gig.source}</span>
        {gig.postedAt && (
          <span className="inline-flex items-center gap-1 text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            {gig.postedAt}
          </span>
        )}
        {gig.comment_count != null && (
          <span className="inline-flex items-center gap-1 text-gray-500">
            <MessageSquare className="w-3.5 h-3.5" />
            {gig.comment_count}
          </span>
        )}
      </div>

      {/* Matched keywords */}
      {gig.keywords && gig.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {gig.keywords.map((kw) => (
            <span
              key={kw}
              className="px-2 py-0.5 bg-[#00F0B5]/10 border border-[#00F0B5]/20 text-[#00F0B5] text-xs font-medium rounded-md"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-4">
        <a
          href={gig.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00F0B5] text-[#020617] text-sm font-semibold rounded-lg hover:bg-[#00dba5] transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Apply Now
        </a>
        <button
          onClick={() => onGenerateProposal(gig)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 text-gray-300 text-sm font-semibold rounded-lg hover:bg-white/10 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Generate Proposal
        </button>
      </div>
    </div>
  );
}
