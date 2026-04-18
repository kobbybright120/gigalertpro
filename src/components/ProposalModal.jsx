import { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Copy,
  Check,
  Save,
  Loader2,
  AlertCircle,
  RefreshCw,
  Lightbulb,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const TONES = [
  { value: "professional", label: "Professional", emoji: "💼" },
  { value: "conversational", label: "Conversational", emoji: "💬" },
  { value: "bold", label: "Bold", emoji: "🔥" },
];

export default function ProposalModal({ gig, profile, onSave, onClose }) {
  const [proposal, setProposal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [tone, setTone] = useState("professional");
  const [showTips, setShowTips] = useState(false);

  // Auto-generate as soon as modal opens
  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setLoading(true);
    setError("");
    setProposal("");
    try {
      // Get the current Supabase session token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/generate-proposal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          gigTitle: gig.title,
          bodyPreview: gig.body_preview || "",
          budget: gig.budget || "",
          source: gig.source_platform || gig.source || "",
          category: gig.category || "",
          matchedKeywords: gig.matched_keywords || [],
          userSkills: profile?.skills || [],
          userBio: profile?.bio || "",
          portfolioLinks: profile?.portfolio_links || [],
          testimonials: profile?.testimonials || [],
          tone,
          upvotes: gig.upvotes || 0,
          commentCount: gig.comment_count || 0,
        }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to generate proposal.");
      setProposal(data.proposal);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!proposal) return;
    await navigator.clipboard.writeText(proposal);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleSave() {
    await onSave(proposal);
    onClose();
  }

  // Close on backdrop click
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-2xl flex flex-col bg-[#0d1117] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh]">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00F0B5]/15 to-[#00D4FF]/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-[#00F0B5]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white leading-none">
                AI Proposal Generator
              </h2>
              <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                {gig.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Gig info chip */}
          <div className="flex flex-wrap items-center gap-2">
            {gig.source_platform && (
              <span className="px-2.5 py-1 bg-white/[0.04] border border-white/[0.07] text-gray-400 text-xs rounded-lg">
                {gig.source_platform}
              </span>
            )}
            {gig.budget && (
              <span className="px-2.5 py-1 bg-[#00F0B5]/[0.06] border border-[#00F0B5]/10 text-[#00F0B5] text-xs font-semibold rounded-lg">
                {gig.budget}
              </span>
            )}
            {gig.category && (
              <span className="px-2.5 py-1 bg-purple-500/[0.07] border border-purple-500/15 text-purple-400 text-xs rounded-lg">
                {gig.category}
              </span>
            )}
            {profile?.skills?.slice(0, 3).map((s) => (
              <span
                key={s}
                className="px-2.5 py-1 bg-indigo-500/[0.07] border border-indigo-500/15 text-indigo-400 text-xs rounded-lg"
              >
                {s}
              </span>
            ))}
          </div>

          {/* Tone selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Tone:</span>
            {TONES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTone(t.value)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                  tone === t.value
                    ? "bg-[#00F0B5]/10 border-[#00F0B5]/30 text-[#00F0B5] font-semibold"
                    : "bg-white/[0.03] border-white/[0.08] text-gray-500 hover:text-gray-300 hover:border-white/[0.15]"
                }`}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <Loader2 className="w-8 h-8 text-[#00F0B5] animate-spin" />
              <p className="text-sm text-gray-400">Writing your proposal…</p>
              <p className="text-xs text-gray-600">
                Personalising with your profile
              </p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex items-start gap-3 p-4 bg-red-500/[0.07] border border-red-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">
                  Generation failed
                </p>
                <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Editable proposal text */}
          {!loading && proposal && (
            <>
              <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">
                Edit before sending
              </p>
              <textarea
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
                className="w-full h-40 sm:h-64 bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 text-sm text-gray-200 leading-relaxed resize-y focus:outline-none focus:border-[#00F0B5]/30 focus:bg-white/[0.05] transition-all placeholder-gray-600"
                spellCheck
              />
            </>
          )}
        </div>

        {/* ── Pro Tips (fixed section above footer) ── */}
        {!loading && proposal && (
          <div className="px-5 pb-3 pt-2 border-t border-white/[0.06] shrink-0 space-y-2">
            <button
              onClick={() => setShowTips(!showTips)}
              className="inline-flex items-center gap-1.5 text-xs text-amber-400/80 hover:text-amber-400 transition-colors"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              {showTips ? "Hide tips" : "Pro tips to win this gig"}
            </button>
            {showTips && (
              <div className="bg-amber-500/[0.05] border border-amber-500/15 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-amber-400">
                  Before you send:
                </p>
                <ul className="text-xs text-amber-400/70 space-y-1.5 list-disc pl-4">
                  <li>
                    Replace generic lines with specific details about THIS
                    project
                  </li>
                  <li>Add a concrete result or number from YOUR past work</li>
                  <li>
                    If the client mentioned a specific tool or tech, mirror that
                    exact word
                  </li>
                  <li>
                    Keep it under 250 words — shorter proposals get 2x more
                    replies
                  </li>
                  <li>
                    End with a specific next step, not just &quot;let me
                    know&quot;
                  </li>
                  <li>
                    Apply within 1 hour of the post for 3x higher response rate
                  </li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-t border-white/[0.06] shrink-0">
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] text-gray-400 text-sm font-semibold rounded-xl hover:bg-white/[0.08] hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all w-full sm:w-auto min-h-[44px]"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Regenerate
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {proposal && !loading && (
              <button
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] text-gray-300 text-sm font-semibold rounded-xl hover:bg-white/[0.08] transition-all flex-1 sm:flex-initial min-h-[44px]"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-[#00F0B5]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Copied!" : "Copy"}
              </button>
            )}
            {proposal && !loading && (
              <button
                onClick={handleSave}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-[#00F0B5] text-[#020617] text-sm font-bold rounded-xl hover:bg-[#00dba5] hover:shadow-[0_0_16px_rgba(0,240,181,0.2)] transition-all flex-1 sm:flex-initial min-h-[44px]"
              >
                <Save className="w-3.5 h-3.5" />
                Save Proposal
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
