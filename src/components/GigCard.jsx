import {
  ExternalLink,
  Sparkles,
  Clock,
  MessageSquare,
  TrendingUp,
  Tag,
  Globe,
  ArrowBigUp,
  Bookmark,
  MapPin,
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
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.083.717 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.182.408-2.256 1.33-3.022.88-.733 2.132-1.163 3.63-1.246 1.07-.06 2.065.043 2.97.287-.09-.688-.305-1.22-.645-1.591-.428-.467-1.08-.706-1.94-.713h-.036c-.677 0-1.553.184-2.166.784l-1.393-1.462C8.68 5.656 10.09 5.1 11.566 5.1h.058c1.394.014 2.476.472 3.215 1.363.652.784 1.02 1.85 1.1 3.18.5.128.97.292 1.404.49 1.164.53 2.1 1.38 2.703 2.459.77 1.376.837 3.592-.399 5.807-1.724 2.148-4.142 3.07-7.39 3.601zm-1.983-7.431c-1.2.065-2.065.403-2.506.818-.42.396-.527.822-.5 1.286.034.614.36 1.115.916 1.41.58.307 1.342.436 2.14.39 1.158-.063 1.965-.474 2.532-1.212.417-.543.7-1.275.837-2.174-.812-.246-1.725-.376-2.698-.354-.246.01-.487.022-.721.036z" />
      </svg>
    ),
  };

  const configs = {
    Reddit: { bg: "bg-orange-500/8 border-orange-500/15 text-orange-400" },
    X: { bg: "bg-gray-500/8 border-gray-500/15 text-gray-300" },
    Craigslist: { bg: "bg-blue-500/8 border-blue-500/15 text-blue-400" },
    Threads: { bg: "bg-fuchsia-500/8 border-fuchsia-500/15 text-fuchsia-400" },
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
  const cleanBudget = gig?.budget
    ? String(gig.budget).trim().replace(/^\$+/, "").replace(/\s+/g, " ")
    : null;

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
        {cleanBudget && cleanBudget !== "—" && (
          <span className="inline-flex items-center gap-0 font-bold text-[#00F0B5]">
            {"$" + cleanBudget}
          </span>
        )}
        <span className="text-gray-500">
          {gig.source_platform || gig.source}
        </span>
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
      <div className="flex flex-wrap items-center gap-2.5 mt-5 pt-4 border-t border-white/[0.04]">
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
        {onSaveGig && (
          <button
            onClick={() => onSaveGig(gig)}
            className={`ml-auto inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              isSaved
                ? "bg-[#00D4FF]/[0.1] border border-[#00D4FF]/20 text-[#00D4FF]"
                : "bg-white/[0.04] border border-white/[0.08] text-gray-500 hover:text-gray-300 hover:bg-white/[0.08]"
            }`}
            title={isSaved ? "Unsave gig" : "Save gig"}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? "fill-current" : ""}`} />
          </button>
        )}
      </div>
    </div>
  );
}
