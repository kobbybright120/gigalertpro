import {
  ExternalLink,
  Sparkles,
  Clock,
  MessageSquare,
  TrendingUp,
  Tag,
  ArrowBigUp,
  Bookmark,
  MapPin,
  Crown,
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

function GoldBadge({ qualityScore }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border bg-yellow-500/15 text-yellow-400 border-yellow-500/30 shadow-[0_0_12px_rgba(234,179,8,0.15)] animate-pulse-slow">
      <Crown className="w-3.5 h-3.5" />
      Gold · {qualityScore}
    </span>
  );
}

function SourceBadge({ platform }) {
  const icons = {
    Reddit: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
    X: (
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    Craigslist: (
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    Threads: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.39 11.27c-.09-.04-.17-.08-.26-.12-.15-2.84-1.71-4.47-4.32-4.49h-.04c-1.56 0-2.86.67-3.66 1.88l1.44.98c.6-.91 1.53-1.1 2.22-1.1h.02c.86 0 1.51.26 1.93.74.31.35.51.84.61 1.46-.76-.13-1.59-.17-2.47-.12-2.48.14-4.08 1.59-3.97 3.6.05 1.02.56 1.9 1.43 2.47.73.48 1.68.72 2.66.67 1.3-.07 2.32-.57 3.03-1.47.54-.69.88-1.58 1.03-2.7.62.37 1.08.86 1.33 1.45.43 1 .46 2.65-.89 4-1.18 1.18-2.6 1.69-4.74 1.7-2.38-.02-4.17-.78-5.34-2.26-1.09-1.39-1.66-3.4-1.68-5.97.02-2.57.59-4.58 1.68-5.97 1.17-1.49 2.97-2.25 5.34-2.26 2.39.02 4.22.78 5.43 2.28.59.73 1.04 1.65 1.34 2.73l1.68-.45c-.36-1.32-.92-2.46-1.69-3.4-1.56-1.91-3.83-2.89-6.76-2.91h-.01c-2.92.02-5.17 1-6.68 2.92C3.71 6.64 3.01 9.02 2.99 12c.02 3 .72 5.37 2.06 7.08C6.56 21 8.81 21.98 11.73 22h.01c2.6-.02 4.43-.7 5.94-2.21 1.98-1.97 1.92-4.45 1.26-5.97-.47-1.09-1.36-1.97-2.58-2.56Zm-4.49 4.22c-1.09.06-2.22-.43-2.27-1.47-.04-.78.55-1.64 2.34-1.74.2-.01.41-.02.6-.02.65 0 1.26.06 1.81.18-.21 2.57-1.41 2.99-2.48 3.05" />
      </svg>
    ),
    Facebook: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
    LinkedIn: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  };

  const configs = {
    Reddit: { bg: "bg-orange-500/8 border-orange-500/15 text-orange-400" },
    X: { bg: "bg-gray-500/8 border-gray-500/15 text-gray-300" },
    Craigslist: { bg: "bg-blue-500/8 border-blue-500/15 text-blue-400" },
    Threads: { bg: "bg-fuchsia-500/8 border-fuchsia-500/15 text-fuchsia-400" },
    Facebook: { bg: "bg-blue-600/8 border-blue-600/15 text-blue-400" },
    LinkedIn: { bg: "bg-sky-600/8 border-sky-600/15 text-sky-400" },
  };
  const config = configs[platform] || configs.Craigslist;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border ${config.bg}`}
    >
      {icons[platform] || icons.Craigslist}
      {platform}
    </span>
  );
}

export default function GigCard({
  gig,
  onGenerateProposal,
  onSaveGig,
  isSaved,
}) {
  const isHot = gig.score >= 70;
  const isGold = gig.is_gold === true;
  const cleanBudget = gig?.budget
    ? String(gig.budget).trim().replace(/^\$+/, "").replace(/\s+/g, " ")
    : null;

  return (
    <div
      className={`glass-card rounded-2xl p-5 sm:p-6 group transition-all duration-300 hover:border-white/10 relative overflow-hidden ${isGold ? "glow-gold" : isHot ? "glow-green" : ""}`}
    >
      {/* Gold lead accent bar */}
      {isGold && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500"></div>
      )}
      {/* Hot gig accent bar (only when not gold) */}
      {!isGold && isHot && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#00F0B5] to-[#00D4FF]"></div>
      )}

      {/* Top row: badges */}
      <div className="flex flex-wrap items-center gap-2 mb-3.5">
        {isGold && <GoldBadge qualityScore={gig.quality_score} />}
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
        <div className="ml-auto shrink-0">
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
        {cleanBudget && cleanBudget !== "—" && (
          <span className="inline-flex items-center gap-0 font-bold text-[#00F0B5]">
            {"$" + cleanBudget}
          </span>
        )}
        {gig.source && gig.source !== gig.source_platform && (
          <span className="text-gray-500">{gig.source}</span>
        )}
        {gig.postedAt && (
          <span className="inline-flex items-center gap-1 text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            {gig.postedAt}
          </span>
        )}
        {gig.location && (
          <span className="inline-flex items-center gap-1 text-gray-500">
            <MapPin className="w-3.5 h-3.5" />
            {gig.location}
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
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 mt-5 pt-4 border-t border-white/[0.04]">
        <a
          href={gig.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-5 py-3 sm:py-2.5 bg-[#00F0B5] text-[#020617] text-sm font-bold rounded-xl hover:bg-[#00dba5] hover:shadow-[0_0_16px_rgba(0,240,181,0.2)] transition-all duration-200 w-full sm:w-auto min-h-[44px]"
        >
          <ExternalLink className="w-4 h-4" />
          Apply Now
        </a>
        <button
          onClick={() => onGenerateProposal(gig)}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-3 sm:py-2.5 bg-white/[0.04] border border-white/[0.08] text-gray-300 text-sm font-semibold rounded-xl hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-200 w-full sm:w-auto min-h-[44px]"
        >
          <Sparkles className="w-4 h-4" />
          Generate Proposal
        </button>
        {onSaveGig && (
          <button
            onClick={() => onSaveGig(gig)}
            className={`sm:ml-auto inline-flex items-center justify-center gap-1.5 px-3 py-3 sm:py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 w-full sm:w-auto min-h-[44px] ${
              isSaved
                ? "bg-[#00D4FF]/[0.1] border border-[#00D4FF]/20 text-[#00D4FF]"
                : "bg-white/[0.04] border border-white/[0.08] text-gray-500 hover:text-gray-300 hover:bg-white/[0.08]"
            }`}
            title={isSaved ? "Unsave gig" : "Save gig"}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? "fill-current" : ""}`} />
            <span className="sm:hidden">{isSaved ? "Saved" : "Save Gig"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
