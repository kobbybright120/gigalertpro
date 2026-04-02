import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  X,
  Search,
  AlertCircle,
  Radar,
  Bell,
  SlidersHorizontal,
  Filter,
  ArrowUpDown,
  Clock,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import GigCard from "../components/GigCard";
import ProposalModal from "../components/ProposalModal";
import {
  useKeywords,
  useGigAlerts,
  useProposals,
  useSavedGigs,
  useProfile,
} from "../lib/useSupabase";
import { useNewGigCount } from "../context/NewGigCountContext";

// ── Skill-to-keyword mapping ─────────────────────────────────────────────────
// Maps profile skills to specific, high-quality search keywords that actually
// find gigs (not vague words that match random posts).
const SKILL_KEYWORD_MAP = {
  // Development
  react: ["react developer", "react native developer", "frontend developer", "next.js developer"],
  "react native": ["react native developer", "mobile app developer", "cross platform app"],
  javascript: ["javascript developer", "frontend developer", "node.js developer", "web developer"],
  typescript: ["typescript developer", "frontend developer", "full stack developer"],
  python: ["python developer", "python script", "django developer", "flask developer", "python automation"],
  node: ["node.js developer", "backend developer", "express developer", "api developer"],
  "node.js": ["node.js developer", "backend developer", "express developer"],
  php: ["php developer", "laravel developer", "wordpress developer"],
  laravel: ["laravel developer", "php developer", "backend developer"],
  wordpress: ["wordpress developer", "wordpress customization", "wordpress site", "woocommerce developer"],
  shopify: ["shopify developer", "shopify store setup", "shopify theme", "shopify expert"],
  wix: ["wix developer", "wix website", "wix designer"],
  squarespace: ["squarespace developer", "squarespace website"],
  html: ["web developer", "frontend developer", "html email developer"],
  css: ["frontend developer", "web developer", "css developer"],
  java: ["java developer", "android developer", "spring developer"],
  swift: ["ios developer", "swift developer", "iphone app developer"],
  flutter: ["flutter developer", "mobile app developer", "cross platform app"],
  angular: ["angular developer", "frontend developer"],
  vue: ["vue.js developer", "frontend developer"],
  "full stack": ["full stack developer", "web developer", "mern developer"],
  fullstack: ["full stack developer", "web developer"],
  backend: ["backend developer", "api developer", "server developer"],
  frontend: ["frontend developer", "ui developer", "web developer"],
  mobile: ["mobile app developer", "ios developer", "android developer"],
  android: ["android developer", "kotlin developer", "mobile app developer"],
  ios: ["ios developer", "swift developer", "iphone app developer"],
  api: ["api developer", "backend developer", "rest api developer"],
  blockchain: ["blockchain developer", "smart contract developer", "web3 developer", "solidity developer"],
  solidity: ["solidity developer", "smart contract developer", "web3 developer"],
  unity: ["unity developer", "game developer", "unity 3d"],
  unreal: ["unreal engine developer", "game developer"],
  godot: ["godot developer", "game developer"],
  rust: ["rust developer", "systems developer"],
  go: ["golang developer", "go developer", "backend developer"],
  ruby: ["ruby developer", "rails developer"],
  sql: ["database developer", "sql developer", "data analyst"],
  mongodb: ["mongodb developer", "nosql developer", "backend developer"],
  aws: ["aws developer", "cloud engineer", "devops engineer"],
  docker: ["devops engineer", "docker developer", "cloud engineer"],
  devops: ["devops engineer", "ci cd engineer", "cloud engineer"],

  // Design
  design: ["graphic designer", "ui ux designer", "web designer", "logo design"],
  "graphic design": ["graphic designer", "brand designer", "flyer design", "poster design"],
  "ui/ux": ["ui ux designer", "product designer", "app designer", "figma designer"],
  "ui ux": ["ui ux designer", "product designer", "figma designer"],
  ux: ["ux designer", "ux researcher", "product designer"],
  ui: ["ui designer", "figma designer", "app designer"],
  figma: ["figma designer", "ui ux designer", "app designer", "prototype designer"],
  photoshop: ["photoshop editor", "photo retoucher", "graphic designer", "image editing"],
  illustrator: ["illustrator designer", "vector artist", "logo design", "illustration"],
  canva: ["canva designer", "social media designer", "graphic designer"],
  logo: ["logo design", "brand identity", "logo designer"],
  branding: ["brand identity", "brand designer", "logo design", "brand guidelines"],
  "3d": ["3d artist", "3d modeler", "blender artist", "3d rendering"],
  blender: ["blender artist", "3d modeler", "3d animation"],

  // Writing
  writing: ["content writer", "blog writer", "copywriter", "seo writer"],
  copywriting: ["copywriter", "email copywriter", "sales copywriter", "ad copywriter"],
  "content writing": ["content writer", "blog writer", "article writer"],
  blogging: ["blog writer", "content writer", "seo writer"],
  seo: ["seo specialist", "seo writer", "seo consultant", "seo audit"],
  editing: ["editor", "proofreader", "copy editor", "content editor"],
  proofreading: ["proofreader", "copy editor", "editor"],
  translation: ["translator", "language translator", "localization"],
  ghostwriting: ["ghostwriter", "ebook writer", "blog ghostwriter"],
  "technical writing": ["technical writer", "documentation writer", "api docs writer"],

  // Video & Audio
  "video editing": ["video editor", "youtube editor", "short form editor", "reels editor"],
  "after effects": ["motion graphics", "after effects editor", "animation"],
  premiere: ["video editor", "premiere editor", "youtube editor"],
  animation: ["animator", "motion graphics", "2d animation", "explainer video"],
  "motion graphics": ["motion graphics", "after effects editor", "animated video"],
  youtube: ["youtube editor", "youtube thumbnail", "youtube manager", "short form editor"],
  podcast: ["podcast editor", "audio editor", "podcast producer"],
  "voice over": ["voice over artist", "narrator", "voice actor"],

  // Marketing
  marketing: ["digital marketing", "social media manager", "marketing strategist", "email marketing"],
  "social media": ["social media manager", "social media marketing", "instagram manager", "tiktok manager"],
  "email marketing": ["email marketing", "email copywriter", "mailchimp expert", "email automation"],
  "google ads": ["google ads manager", "ppc specialist", "sem expert"],
  "facebook ads": ["facebook ads manager", "meta ads specialist", "paid social"],
  ads: ["facebook ads manager", "google ads manager", "ppc specialist"],
  ppc: ["ppc specialist", "google ads manager", "paid search"],
  "lead generation": ["lead generation", "cold email", "outbound sales", "lead gen specialist"],

  // Data & AI
  "data entry": ["data entry", "data entry clerk", "spreadsheet work"],
  "web scraping": ["web scraping", "data scraping", "python scraping"],
  scraping: ["web scraping", "data scraping", "python scraping"],
  chatbot: ["chatbot developer", "ai chatbot", "customer service bot"],
  ai: ["ai developer", "machine learning engineer", "chatbot developer", "ai automation"],
  "machine learning": ["machine learning engineer", "data scientist", "ml developer"],
  "data analysis": ["data analyst", "excel analyst", "business intelligence"],
  automation: ["automation developer", "zapier expert", "workflow automation", "python automation"],

  // Business & Admin
  "virtual assistant": ["virtual assistant", "executive assistant", "admin support"],
  "project management": ["project manager", "scrum master", "project coordinator"],
  bookkeeping: ["bookkeeper", "quickbooks expert", "accounting"],
  "customer support": ["customer support", "customer service", "help desk"],
};

// Fallback generic groups for users with no profile skills
const GENERIC_GROUPS = [
  { label: "🖥 Development", keywords: ["react developer", "wordpress developer", "shopify developer", "mobile app developer", "full stack developer", "web developer", "python developer"] },
  { label: "🎨 Design", keywords: ["logo design", "ui ux designer", "graphic designer", "brand identity", "thumbnail designer", "figma designer"] },
  { label: "✍️ Writing", keywords: ["blog writer", "seo writer", "copywriter", "content writer", "ghostwriter", "technical writer"] },
  { label: "📹 Video & Audio", keywords: ["video editor", "youtube editor", "motion graphics", "voice over", "podcast editor"] },
  { label: "📈 Marketing", keywords: ["social media manager", "seo specialist", "email marketing", "facebook ads", "google ads"] },
  { label: "🤖 Data & AI", keywords: ["data entry", "web scraping", "chatbot developer", "data analyst", "automation"] },
  { label: "💼 Business", keywords: ["virtual assistant", "project manager", "bookkeeper", "customer support", "lead generation"] },
];

function getSuggestionGroups(profile, existingKeywords) {
  const skills = profile?.skills;
  if (!skills || skills.length === 0) return GENERIC_GROUPS;

  // Build personalized suggestions from profile skills
  const seen = new Set(existingKeywords.map((k) => k.keyword?.toLowerCase()));
  const groups = [];

  // Group 1: Direct skill-based suggestions ("For you")
  const personalKws = new Set();
  for (const skill of skills) {
    const key = skill.toLowerCase().trim();
    const mapped = SKILL_KEYWORD_MAP[key];
    if (mapped) {
      for (const kw of mapped) {
        if (!seen.has(kw.toLowerCase())) personalKws.add(kw);
      }
    } else {
      // Skill not in map — use the skill itself as a keyword suggestion
      // plus common patterns like "{skill} developer", "{skill} designer"
      const base = key;
      if (!seen.has(base)) personalKws.add(skill.trim());
      const withDev = `${base} developer`;
      const withDesigner = `${base} designer`;
      const withFreelancer = `${base} freelancer`;
      if (!seen.has(withDev)) personalKws.add(withDev);
      if (!seen.has(withDesigner)) personalKws.add(withDesigner);
      if (!seen.has(withFreelancer)) personalKws.add(withFreelancer);
    }
  }

  if (personalKws.size > 0) {
    groups.push({
      label: `⚡ Based on your skills (${skills.slice(0, 4).join(", ")}${skills.length > 4 ? "..." : ""})`,
      keywords: [...personalKws].slice(0, 15),
    });
  }

  // Group 2: Add a couple of generic groups the user might also want
  // Pick groups that don't overlap much with their skills
  const skillsLower = skills.map((s) => s.toLowerCase());
  const devSkills = ["react", "javascript", "python", "node", "php", "java", "swift", "flutter", "angular", "vue", "html", "css", "typescript", "wordpress", "shopify", "fullstack", "full stack", "frontend", "backend", "mobile", "android", "ios"];
  const designSkills = ["design", "figma", "photoshop", "illustrator", "canva", "logo", "branding", "ui", "ux", "ui/ux", "ui ux", "3d", "blender", "graphic design"];
  const writingSkills = ["writing", "copywriting", "content writing", "seo", "editing", "blogging", "ghostwriting", "translation", "proofreading", "technical writing"];

  const hasDev = skillsLower.some((s) => devSkills.includes(s));
  const hasDesign = skillsLower.some((s) => designSkills.includes(s));
  const hasWriting = skillsLower.some((s) => writingSkills.includes(s));

  // Suggest 1-2 adjacent categories they haven't listed
  if (!hasDev) groups.push(GENERIC_GROUPS[0]);
  if (!hasDesign) groups.push(GENERIC_GROUPS[1]);
  if (!hasWriting) groups.push(GENERIC_GROUPS[2]);

  // Cap to 3 groups max so it doesn't get overwhelming
  return groups.slice(0, 3);
}

export default function GigAlertsPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [sortBy, setSortBy] = useState("time"); // "time" | "score"
  const [proposalGig, setProposalGig] = useState(null); // gig selected for AI proposal
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { keywords, addKeyword, removeKeyword } = useKeywords();
  const { alerts, loading: alertsLoading } = useGigAlerts(keywords);
  const { saveProposal } = useProposals();
  const { savedIds, toggleSave } = useSavedGigs();
  const { reset: resetGigCount } = useNewGigCount();
  const { profile } = useProfile();

  // Derive last-updated time from alert freshness
  const lastUpdated = useMemo(
    () => (alerts.length > 0 && !alertsLoading ? new Date() : null),
    [alerts.length, alertsLoading],
  );

  // Clear the badge whenever the user is on this page
  useEffect(() => {
    resetGigCount();
  }, [resetGigCount]);

  function handleAddKeyword(e) {
    e.preventDefault();
    if (!input.trim()) return;
    addKeyword(input);
    setInput("");
  }

  function handleGenerateProposal(gig) {
    setProposalGig(gig);
  }

  async function handleSaveProposal(text) {
    if (!proposalGig) return;
    await saveProposal({
      gigTitle: proposalGig.title,
      description: proposalGig.budget
        ? `${proposalGig.source} · ${proposalGig.budget}`
        : proposalGig.source || "",
      text,
      alertId: null, // client-side gig IDs don't map to DB gig_alerts.id
    });
    navigate("/proposals");
  }

  // Filter alerts by source + category, then sort
  let filtered = alerts;
  if (activeFilter !== "all")
    filtered = filtered.filter(
      (a) => a.source_platform?.toLowerCase() === activeFilter,
    );
  if (activeCategory !== "all")
    filtered = filtered.filter(
      (a) => a.category?.toLowerCase() === activeCategory.toLowerCase(),
    );
  if (sortBy === "score")
    filtered = [...filtered].sort((a, b) => (b.score || 0) - (a.score || 0));

  // Count by source
  const redditCount = alerts.filter(
    (a) => a.source_platform === "Reddit",
  ).length;
  const craigslistCount = alerts.filter(
    (a) => a.source_platform === "Craigslist",
  ).length;
  const xCount = alerts.filter((a) => a.source_platform === "X").length;

  // Collect unique categories from current alerts
  const categorySet = new Set(alerts.map((a) => a.category).filter(Boolean));
  const categories = [...categorySet].sort();

  return (
    <div className="p-5 lg:p-8 space-y-6 max-w-6xl">
      {/* AI Proposal Modal */}
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F0B5]/15 to-[#00D4FF]/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-[#00F0B5]" />
            </div>
            Gig Alerts
          </h1>
          <p className="text-gray-500 mt-1.5 text-sm">
            Real-time gig matching across Reddit, Craigslist & X/Twitter
          </p>
        </div>
        <span className="inline-flex items-center gap-2 px-4 py-2 glass-card rounded-full border border-[#00F0B5]/15 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]" />
          </span>
          <span className="text-xs font-semibold text-[#00F0B5] tracking-wide">
            Live Scanning
          </span>
        </span>
      </div>

      {/* Search bar */}
      <div className="glass-card rounded-2xl p-5">
        <form onSubmit={handleAddKeyword} className="flex gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-600" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search for gigs... e.g. React developer, logo design, video editor"
              className="w-full pl-10 pr-4 py-3 bg-[#020617]/60 border border-white/[0.06] rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-[#00F0B5]/30 focus:border-[#00F0B5]/20 outline-none transition-all duration-200 text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-[#00F0B5] text-[#020617] rounded-xl font-bold hover:bg-[#00dba5] hover:shadow-[0_0_16px_rgba(0,240,181,0.2)] transition-all duration-200 shrink-0 flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Track
          </button>
        </form>

        {/* Keyword tips + suggestions */}
        {keywords.length === 0 && !showSuggestions && (
          <div className="mt-3 flex items-center gap-2">
            <p className="text-xs text-gray-500">
              💡 Use specific job titles or skills for best results.
            </p>
            <button
              onClick={() => setShowSuggestions(true)}
              className="text-xs text-[#00F0B5]/70 hover:text-[#00F0B5] transition-colors underline underline-offset-2"
            >
              {profile?.skills?.length > 0 ? "Suggestions based on your profile" : "Show examples"}
            </button>
          </div>
        )}

        {showSuggestions && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {profile?.skills?.length > 0 ? "Based on your profile" : "Tap to add"}
              </p>
              <button
                onClick={() => setShowSuggestions(false)}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Hide
              </button>
            </div>
            {getSuggestionGroups(profile, keywords).map((group) => (
              <div key={group.label}>
                <p className="text-xs text-gray-500 mb-1.5">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.keywords
                    .filter(
                      (kw) =>
                        !keywords.some((k) => k.keyword === kw.toLowerCase()),
                    )
                    .map((kw) => (
                      <button
                        key={kw}
                        onClick={() => {
                          addKeyword(kw);
                        }}
                        className="px-2.5 py-1 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-gray-400 hover:text-[#00F0B5] hover:border-[#00F0B5]/20 hover:bg-[#00F0B5]/[0.04] transition-all"
                      >
                        + {kw}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            {profile?.skills?.length > 0 && (
              <p className="text-[11px] text-gray-600 italic">
                These suggestions come from your profile skills. Update your{" "}
                <button
                  onClick={() => navigate("/profile")}
                  className="text-[#00F0B5]/60 hover:text-[#00F0B5] underline underline-offset-2 transition-colors"
                >
                  profile
                </button>
                {" "}to get different suggestions.
              </p>
            )}
          </div>
        )}

        {/* Active keyword pills */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {keywords.map((kwObj) => (
              <span
                key={kwObj.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00F0B5]/[0.06] border border-[#00F0B5]/15 rounded-lg text-sm text-[#00F0B5] font-medium"
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

      {/* Filter tabs + sort + count */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {[
              { key: "all", label: "All", count: alerts.length },
              { key: "reddit", label: "Reddit", count: redditCount },
              {
                key: "craigslist",
                label: "Craigslist",
                count: craigslistCount,
              },
              { key: "x", label: "𝕏 / Twitter", count: xCount },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  activeFilter === key
                    ? "bg-[#00F0B5]/[0.08] text-[#00F0B5] border border-[#00F0B5]/15 shadow-[inset_0_0_0_1px_rgba(0,240,181,0.05)]"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent"
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {/* Sort toggle */}
            <div className="flex items-center gap-1 glass-card rounded-lg p-0.5">
              <button
                onClick={() => setSortBy("time")}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                  sortBy === "time"
                    ? "bg-[#00F0B5]/[0.1] text-[#00F0B5]"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Clock className="w-3 h-3" />
                Newest
              </button>
              <button
                onClick={() => setSortBy("score")}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                  sortBy === "score"
                    ? "bg-[#00F0B5]/[0.1] text-[#00F0B5]"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                Top Score
              </button>
            </div>
            <span className="text-xs text-gray-600 font-medium">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Category filter pills */}
        {categories.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="w-3.5 h-3.5 text-gray-600 shrink-0" />
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                activeCategory === "all"
                  ? "bg-indigo-500/[0.1] text-indigo-400 border border-indigo-500/15"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              All Categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                  activeCategory === cat
                    ? "bg-indigo-500/[0.1] text-indigo-400 border border-indigo-500/15"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Last updated */}
        {lastUpdated && !alertsLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <RefreshCw className="w-3 h-3" />
            Updated{" "}
            {lastUpdated.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="grid gap-4">
        {alertsLoading ? (
          <div className="space-y-4">
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
                Searching Reddit, Craigslist & X/Twitter for matching gigs
              </p>
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-20 rounded-lg animate-shimmer" />
                  <div className="h-6 w-16 rounded-lg animate-shimmer" />
                </div>
                <div className="h-5 w-3/4 rounded-lg animate-shimmer mb-2" />
                <div className="h-4 w-full rounded-lg animate-shimmer mb-1" />
                <div className="h-4 w-2/3 rounded-lg animate-shimmer mb-4" />
                <div className="flex gap-3">
                  <div className="h-4 w-16 rounded-lg animate-shimmer" />
                  <div className="h-4 w-20 rounded-lg animate-shimmer" />
                </div>
                <div className="flex gap-2.5 mt-5 pt-4 border-t border-white/[0.04]">
                  <div className="h-10 w-28 rounded-xl animate-shimmer" />
                  <div className="h-10 w-36 rounded-xl animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : keywords.length === 0 ? (
          <div className="glass-card rounded-2xl p-14 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#00F0B5]/[0.08] flex items-center justify-center mx-auto mb-5">
              <Search className="w-8 h-8 text-[#00F0B5]" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              Start tracking gigs
            </h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto mb-4">
              Add specific job titles or skills to find matching gigs from
              Reddit, Craigslist & X/Twitter. Be the first to apply!
            </p>
            <div className="text-xs text-gray-600 max-w-sm mx-auto space-y-1">
              <p>✅ Good: <span className="text-gray-400">"react developer"</span>, <span className="text-gray-400">"logo design"</span>, <span className="text-gray-400">"video editor"</span></p>
              <p>❌ Avoid: <span className="text-gray-400">"website"</span>, <span className="text-gray-400">"design"</span>, <span className="text-gray-400">"code"</span> (too broad)</p>
            </div>
            {!showSuggestions && (
              <button
                onClick={() => setShowSuggestions(true)}
                className="mt-4 text-xs text-[#00F0B5]/70 hover:text-[#00F0B5] transition-colors underline underline-offset-2"
              >
                {profile?.skills?.length > 0
                  ? "Get suggestions from your profile"
                  : "Browse keyword suggestions"}
              </button>
            )}
          </div>
        ) : filtered.length > 0 ? (
          filtered.map((alert) => (
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
                upvotes: alert.upvotes,
                source_platform: alert.source_platform || "Reddit",
              }}
              onGenerateProposal={handleGenerateProposal}
              onSaveGig={(gig) => toggleSave(gig.id)}
              isSaved={savedIds.has(alert.id)}
            />
          ))
        ) : (
          <div className="glass-card rounded-2xl p-14 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-5">
              <AlertCircle className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              No matches yet
            </h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              No gigs matched your keywords right now. New gigs are scanned
              every few minutes — check back soon!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
