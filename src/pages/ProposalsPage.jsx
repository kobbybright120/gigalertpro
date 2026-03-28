import { useState } from "react";
import { Bot, Trash2, Copy, Check, Loader2 } from "lucide-react";
import { useProposals } from "../lib/useSupabase";

export default function ProposalsPage() {
  const { proposals, loading, deleteProposal } = useProposals();
  const [copiedId, setCopiedId] = useState(null);

  function handleCopy(id, text) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">My Proposals</h1>
        <p className="text-gray-400 mt-1">Saved AI-generated pitches.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#00F0B5] animate-spin" />
        </div>
      ) : proposals.length === 0 ? (
        <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-16 text-center">
          <div className="flex justify-center mb-4">
            <Bot className="w-16 h-16 text-gray-600" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            No saved proposals
          </h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            When you generate a pitch from the Gig Alerts page, it will be saved
            here for future reference.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {proposals.map((p) => (
            <div
              key={p.id}
              className="bg-[#0B1120] border border-white/5 rounded-2xl p-6"
            >
              {/* Date */}
              <p className="text-sm text-[#00F0B5] mb-2">
                {new Date(p.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>

              {/* Gig Title */}
              <h3 className="text-lg font-bold text-white mb-2">
                {p.gig_title}
              </h3>

              {/* Short description / first line preview */}
              {p.description && (
                <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                  {p.description}
                </p>
              )}

              {/* Proposal text in monospace block */}
              <div className="bg-[#020617] border border-white/5 rounded-xl p-5 mb-5">
                <p className="text-sm text-gray-400 font-mono whitespace-pre-line line-clamp-6">
                  {p.text}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => deleteProposal(p.id)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-gray-400 hover:text-red-400 transition-colors text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={() => handleCopy(p.id, p.text)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 text-gray-300 text-sm font-medium rounded-lg hover:bg-white/10 transition-colors"
                >
                  {copiedId === p.id ? (
                    <Check className="w-4 h-4 text-[#00F0B5]" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copiedId === p.id ? "Copied!" : "Copy Full Text"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
