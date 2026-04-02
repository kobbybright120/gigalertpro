import { useState } from "react";
import {
  Bot,
  Trash2,
  Copy,
  Check,
  Loader2,
  FileText,
  Trophy,
  MessageSquare,
  MinusCircle,
} from "lucide-react";
import { useProposals } from "../lib/useSupabase";

const OUTCOMES = [
  {
    key: "won",
    label: "Won",
    icon: Trophy,
    active: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    hover: "hover:bg-emerald-500/[0.06] hover:text-emerald-400",
  },
  {
    key: "replied",
    label: "Got Reply",
    icon: MessageSquare,
    active: "bg-blue-500/10 border-blue-500/25 text-blue-400",
    hover: "hover:bg-blue-500/[0.06] hover:text-blue-400",
  },
  {
    key: "no_response",
    label: "No Reply",
    icon: MinusCircle,
    active: "bg-white/[0.06] border-white/[0.12] text-gray-400",
    hover: "hover:bg-white/[0.06] hover:text-gray-400",
  },
];

export default function ProposalsPage() {
  const { proposals, loading, deleteProposal, saveOutcome } = useProposals();
  const [copiedId, setCopiedId] = useState(null);

  function handleCopy(id, text) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="p-5 lg:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/15 to-purple-400/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-purple-400" />
          </div>
          My Proposals
        </h1>
        <p className="text-gray-500 mt-1.5 text-sm">
          Saved AI-generated pitches for your gig applications
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#00F0B5] animate-spin" />
        </div>
      ) : proposals.length === 0 ? (
        <div className="glass-card rounded-2xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-5">
            <Bot className="w-8 h-8 text-gray-600" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            No saved proposals
          </h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            When you generate a pitch from the Gig Alerts page, it will be saved
            here for future reference.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {proposals.map((p) => (
            <div
              key={p.id}
              className="glass-card rounded-2xl p-5 hover:border-white/10 transition-all duration-300 flex flex-col"
            >
              {/* Date */}
              <p className="text-xs font-semibold text-[#00F0B5] mb-2 uppercase tracking-wider">
                {new Date(p.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>

              {/* Gig Title */}
              <h3 className="text-base font-bold text-white mb-1 line-clamp-2">
                {p.gig_title}
              </h3>

              {/* Short description */}
              {p.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-1">
                  {p.description}
                </p>
              )}

              {/* Proposal text */}
              <div className="bg-[#020617]/50 border border-white/[0.04] rounded-xl p-4 mb-4 flex-1">
                <p className="text-sm text-gray-400 font-mono whitespace-pre-line line-clamp-8 leading-relaxed">
                  {p.text}
                </p>
              </div>

              {/* Outcome tracker — trains the AI */}
              <div className="mb-3">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">
                  How did it go?{" "}
                  <span className="normal-case text-[#00F0B5]/60">
                    (helps the AI write better proposals)
                  </span>
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {OUTCOMES.map(({ key, label, icon: Icon, active, hover }) => {
                    const isActive = p.outcome === key;
                    return (
                      <button
                        key={key}
                        onClick={() => saveOutcome(p.id, isActive ? null : key)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-200 ${
                          isActive
                            ? active
                            : `bg-white/[0.03] border-white/[0.07] text-gray-600 ${hover}`
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2.5 mt-auto pt-3 border-t border-white/[0.04]">
                <button
                  onClick={() => handleCopy(p.id, p.text)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/[0.04] border border-white/[0.08] text-gray-300 text-sm font-semibold rounded-xl hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-200"
                >
                  {copiedId === p.id ? (
                    <Check className="w-3.5 h-3.5 text-[#00F0B5]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedId === p.id ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => deleteProposal(p.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-red-400 hover:bg-red-500/[0.06] rounded-xl transition-all duration-200 text-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
