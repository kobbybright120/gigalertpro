import { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  X,
  Radar,
  ArrowRight,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  trackOnboardingStepViewed,
  trackOnboardingSkillAdded,
  trackOnboardingSkillRemoved,
  trackOnboardingCompleted,
} from "../lib/umami";

const DISABLE_AUTH =
  import.meta.env.VITE_DISABLE_AUTH === "true" ||
  !import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env.VITE_SUPABASE_URL || "").includes("placeholder") ||
  !import.meta.env.VITE_SUPABASE_ANON_KEY;

const SCANNING_SOURCES = [
  "Checking r/forhire...",
  "Checking r/freelance...",
  "Checking X/Twitter...",
  "Checking Threads...",
  "Checking Craigslist...",
  "Checking Facebook...",
];

export default function OnboardingFlow({ onComplete }) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [skills, setSkills] = useState([]);
  const [input, setInput] = useState("");
  const [scanningText, setScanningText] = useState(SCANNING_SOURCES[0]);
  const [scanProgress, setScanProgress] = useState(0);
  const [gigCount, setGigCount] = useState(0);
  const scanRef = useRef(null);

  // Track step 1 on mount
  useEffect(() => {
    trackOnboardingStepViewed(1);
  }, []);
  const suggestions = [
    "React Developer",
    "Logo Design",
    "Video Editor",
    "Copywriter",
    "Python Developer",
    "WordPress",
    "SEO",
    "Virtual Assistant",
  ];

  function addSkill(skill) {
    const clean = skill.trim();
    if (!clean) return;
    if (skills.some((s) => s.toLowerCase() === clean.toLowerCase())) return;
    setSkills((prev) => [...prev, clean]);
    trackOnboardingSkillAdded(clean);
    setInput("");
  }

  function removeSkill(skill) {
    setSkills((prev) => prev.filter((s) => s !== skill));
    trackOnboardingSkillRemoved(skill);
  }

  function handleSubmitSkills(e) {
    e.preventDefault();
    if (input.trim()) addSkill(input);
  }

  // Step 2: scanning animation
  useEffect(() => {
    if (step !== 2) return;
    trackOnboardingStepViewed(2);
    let idx = 0;
    let progress = 0;
    const interval = setInterval(() => {
      progress += 2;
      setScanProgress(Math.min(progress, 100));
      const newIdx = Math.floor((progress / 100) * SCANNING_SOURCES.length);
      if (newIdx !== idx && newIdx < SCANNING_SOURCES.length) {
        idx = newIdx;
        setScanningText(SCANNING_SOURCES[idx]);
      }
      if (progress >= 100) {
        clearInterval(interval);
        fetchGigCount();
      }
    }, 60);
    scanRef.current = interval;
    return () => clearInterval(scanRef.current);
  }, [step]);

  async function fetchGigCount() {
    let count = 0;
    if (!DISABLE_AUTH) {
      try {
        const twentyFourHoursAgo = new Date(
          Date.now() - 24 * 60 * 60 * 1000,
        ).toISOString();
        const orFilter = skills
          .flatMap((kw) => {
            const safe = kw.toLowerCase().replace(/[%_]/g, "\\$&");
            return [`title.ilike.%${safe}%`, `body_preview.ilike.%${safe}%`];
          })
          .join(",");
        const { count: dbCount } = await supabase
          .from("gig_alerts")
          .select("id", { count: "exact", head: true })
          .or(orFilter)
          .gte("reddit_created", twentyFourHoursAgo);
        count = dbCount || 0;
      } catch {
        count = 0;
      }
    }
    setGigCount(count);
    setStep(3);
    trackOnboardingStepViewed(3);
  }

  async function handleFinishOnboarding() {
    // Save skills as keywords
    if (!DISABLE_AUTH && user) {
      // Insert keywords, ignoring duplicates via upsert
      for (const skill of skills) {
        try {
          await supabase
            .from("keywords")
            .upsert(
              { user_id: user.id, keyword: skill.toLowerCase() },
              { onConflict: "user_id,keyword", ignoreDuplicates: true },
            );
        } catch {
          // ignore
        }
      }
      // Mark onboarding complete via dedicated RPC (SECURITY DEFINER, bypasses RLS)
      try {
        const { error } = await supabase.rpc("complete_onboarding");
        if (error) console.error("complete_onboarding RPC failed:", error);
      } catch (e) {
        console.error("complete_onboarding call failed:", e);
      }
    } else {
      // Demo mode
      try {
        const existing = JSON.parse(
          localStorage.getItem("gigalertpro_demo_keywords") || "[]",
        );
        const newKws = skills
          .filter((s) => !existing.some((k) => k.keyword === s.toLowerCase()))
          .map((s, i) => ({
            id: Date.now() + i,
            keyword: s.toLowerCase(),
          }));
        localStorage.setItem(
          "gigalertpro_demo_keywords",
          JSON.stringify([...existing, ...newKws]),
        );
        localStorage.setItem("gigalertpro_onboarding_completed", "true");
      } catch {}
    }
    onComplete(skills, gigCount);
    trackOnboardingCompleted(skills);
  }

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
      <div className="max-w-xl w-full">
        {/* Progress indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                s <= step ? "w-12 bg-[#00F0B5]" : "w-8 bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Skill Setup */}
        {step === 1 && (
          <div className="animate-slideIn">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00F0B5] to-[#00D4FF] mb-5">
                <Search className="w-8 h-8 text-[#020617]" />
              </div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                What kind of gigs are you looking for?
              </h1>
              <p className="text-gray-400 mt-3 text-base">
                Add your skills or keywords and we'll find matching gigs across
                Reddit, X/Twitter, Threads, LinkedIn & Craigslist.
              </p>
            </div>

            {/* Input */}
            <form onSubmit={handleSubmitSkills} className="flex gap-2.5 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-600" />
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a skill or keyword..."
                  className="w-full pl-10 pr-4 py-3.5 bg-[#0d1425] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-[#00F0B5]/30 focus:border-[#00F0B5]/20 outline-none transition-all duration-200 text-sm"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-3.5 bg-white/[0.06] border border-white/[0.08] text-white rounded-xl font-bold hover:bg-white/[0.1] transition-all duration-200 shrink-0"
              >
                <Plus className="w-5 h-5" />
              </button>
            </form>

            {/* Keyword tip */}
            <div className="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-xl bg-[#00F0B5]/[0.04] border border-[#00F0B5]/10">
              <Lightbulb className="w-3.5 h-3.5 text-[#00F0B5] mt-0.5 shrink-0" />
              <p className="text-[11px] leading-relaxed text-gray-400">
                <span className="text-[#00F0B5] font-medium">Tip:</span> Use
                clear keywords like{" "}
                <span className="text-white/70">Shopify</span>,{" "}
                <span className="text-white/70">React</span>,{" "}
                <span className="text-white/70">WordPress</span> or full task
                phrases like{" "}
                <span className="text-white/70">"logo design"</span> or{" "}
                <span className="text-white/70">"React developer"</span> to get
                better results.
              </p>
            </div>

            {/* Added skills */}
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#00F0B5]/[0.08] border border-[#00F0B5]/20 rounded-xl text-sm text-[#00F0B5] font-medium"
                  >
                    {skill}
                    <button
                      onClick={() => removeSkill(skill)}
                      className="hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Suggestions */}
            <div className="mb-8">
              <p className="text-xs text-gray-500 mb-2.5 uppercase tracking-wider font-semibold">
                Popular skills
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions
                  .filter(
                    (s) =>
                      !skills.some(
                        (sk) => sk.toLowerCase() === s.toLowerCase(),
                      ),
                  )
                  .map((sug) => (
                    <button
                      key={sug}
                      onClick={() => addSkill(sug)}
                      className="px-3.5 py-2 rounded-xl text-sm font-medium bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:text-[#00F0B5] hover:border-[#00F0B5]/20 hover:bg-[#00F0B5]/[0.04] transition-all duration-200"
                    >
                      + {sug}
                    </button>
                  ))}
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => {
                if (skills.length === 0) return;
                setStep(2);
              }}
              disabled={skills.length === 0}
              className={`w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-300 ${
                skills.length > 0
                  ? "bg-[#00F0B5] text-[#020617] hover:bg-[#00dba5] hover:shadow-[0_0_24px_rgba(0,240,181,0.25)]"
                  : "bg-white/[0.04] text-gray-600 cursor-not-allowed"
              }`}
            >
              Find My Gigs
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Step 2: Scanning */}
        {step === 2 && (
          <div className="animate-slideIn text-center">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <Radar
                className="w-20 h-20 text-[#00F0B5] animate-spin"
                style={{ animationDuration: "2s" }}
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-4 h-4 rounded-full bg-[#00F0B5] animate-ping" />
              </span>
            </div>

            <h1 className="text-2xl font-extrabold text-white mb-2">
              Scanning for your gigs...
            </h1>
            <p className="text-gray-400 text-base mb-8">
              Scanning Reddit, X/Twitter, Threads, LinkedIn & Craigslist for
              your gigs
            </p>

            {/* Progress bar */}
            <div className="w-full bg-white/[0.06] rounded-full h-2 mb-4 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#00F0B5] to-[#00D4FF] rounded-full transition-all duration-200"
                style={{ width: `${scanProgress}%` }}
              />
            </div>

            {/* Cycling source text */}
            <p className="text-sm text-[#00F0B5] font-medium animate-pulse">
              {scanningText}
            </p>

            {/* Skill chips shown below */}
            <div className="flex flex-wrap justify-center gap-2 mt-8">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1.5 bg-[#00F0B5]/[0.06] border border-[#00F0B5]/15 rounded-lg text-sm text-[#00F0B5] font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Results Reveal */}
        {step === 3 && (
          <div className="animate-slideIn text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00F0B5] to-[#00D4FF] mb-5">
              <Sparkles className="w-8 h-8 text-[#020617]" />
            </div>

            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-3">
              {gigCount > 0 ? (
                <>
                  We found{" "}
                  <span className="text-gradient">{gigCount} gigs</span>{" "}
                  matching your skills
                </>
              ) : (
                <>
                  You're all set! We're scanning for{" "}
                  <span className="text-gradient">your gigs</span>
                </>
              )}
            </h1>
            <p className="text-gray-400 text-base mb-2">{skills.join(", ")}</p>
            <p className="text-gray-500 text-sm mb-8">
              {gigCount > 0
                ? "Here's a preview of what's waiting for you 👇"
                : "We'll notify you as soon as gigs matching your skills come in"}
            </p>

            {/* Animated counter */}
            {gigCount > 0 && (
              <div className="glass-card rounded-2xl p-6 mb-8 glow-green">
                <div className="text-5xl font-extrabold text-gradient mb-2">
                  {gigCount}
                </div>
                <p className="text-sm text-gray-400">
                  gigs matching your skills right now
                </p>
              </div>
            )}

            <button
              onClick={handleFinishOnboarding}
              className="w-full py-4 bg-[#00F0B5] text-[#020617] rounded-xl font-bold text-base hover:bg-[#00dba5] hover:shadow-[0_0_24px_rgba(0,240,181,0.25)] transition-all duration-300 flex items-center justify-center gap-2"
            >
              Show Me My Gigs
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
