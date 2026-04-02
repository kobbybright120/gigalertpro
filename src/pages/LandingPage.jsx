import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Zap,
  ArrowRight,
  Sparkles,
  UserCircle,
  CheckCircle2,
  Quote,
  Shield,
  Clock,
  Check,
  Star,
  Bell,
  Bookmark,
  Trophy,
  TrendingUp,
  Search,
  Globe,
  MessageSquare,
  AlertTriangle,
  Radio,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   SCROLL-REVEAL HOOK — fade-in + slide-up on viewport entry
   ═══════════════════════════════════════════════════════════════════════ */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

const reveal = (visible, delay = 0) =>
  `transition-all duration-700 ease-out ${
    visible ? `opacity-100 translate-y-0` : `opacity-0 translate-y-8`
  }` + (delay ? ` delay-[${delay}ms]` : "");

/* Stagger helper — returns Tailwind delay class */
const stagger = (i) => {
  const ms = i * 100;
  return { transitionDelay: `${ms}ms` };
};

/* ═══════════════════════════════════════════════════════════════════════
   LIVE DEMO DATA — simulates the gig-scanning & discovery flow
   ═══════════════════════════════════════════════════════════════════════ */
const DEMO_KEYWORDS = [
  {
    label: "React Developer",
    color: "bg-[#00F0B5]/10 text-[#00F0B5] border-[#00F0B5]/20",
  },
  {
    label: "Logo Design",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  {
    label: "Shopify Expert",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
];

const DEMO_GIGS = [
  {
    id: 1,
    title: "React Developer for SaaS Dashboard",
    source: "Reddit",
    sourceColor: "text-orange-400",
    sub: "r/forhire",
    budget: "$4,000 – $6,000",
    score: 92,
    time: "2 min ago",
    keywords: ["React", "TypeScript", "API"],
    upvotes: 8,
  },
  {
    id: 2,
    title: "Need a Modern Logo for Fitness App",
    source: "Craigslist",
    sourceColor: "text-violet-400",
    sub: "New York",
    budget: "$800 – $1,200",
    score: 78,
    time: "5 min ago",
    keywords: ["Logo Design", "Branding"],
    upvotes: 3,
  },
  {
    id: 3,
    title: "Full-Stack Dev for Headless Shopify Rebuild",
    source: "Reddit",
    sourceColor: "text-orange-400",
    sub: "r/freelance",
    budget: "$6,000 – $10,000",
    score: 95,
    time: "8 min ago",
    keywords: ["Shopify", "Next.js", "Performance"],
    upvotes: 24,
  },
  {
    id: 4,
    title: "Video Editor for YouTube Channel",
    source: "X / Twitter",
    sourceColor: "text-sky-400",
    sub: "@startupgigs",
    budget: "$500 / video",
    score: 71,
    time: "12 min ago",
    keywords: ["Video Editing", "YouTube"],
    upvotes: 5,
  },
  {
    id: 5,
    title: "WordPress Developer for Agency Site",
    source: "Reddit",
    sourceColor: "text-orange-400",
    sub: "r/hiring",
    budget: "$2,000 – $3,500",
    score: 84,
    time: "15 min ago",
    keywords: ["WordPress", "PHP"],
    upvotes: 11,
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  /* Section refs for scroll-reveal */
  const [heroRef, heroVis] = useReveal(0.1);
  const [statsRef, statsVis] = useReveal();
  const [featRef, featVis] = useReveal(0.08);
  const [howRef, howVis] = useReveal();
  const [demoRef, demoVis] = useReveal(0.08);
  const [priceRef, priceVis] = useReveal(0.08);
  const [proofRef, proofVis] = useReveal(0.08);
  const [ctaRef, ctaVis] = useReveal();

  return (
    <div className="min-h-screen bg-[#020617] text-white font-sans overflow-x-hidden">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-[#020617]/70 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-xl font-bold tracking-tight"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00F0B5] to-[#00D4FF] flex items-center justify-center">
              <Zap className="w-4.5 h-4.5 text-[#020617]" />
            </div>
            <span>
              GigAlert<span className="text-gradient">Pro</span>
            </span>
          </Link>
          <div className="hidden sm:flex items-center gap-6 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a
              href="#how-it-works"
              className="hover:text-white transition-colors"
            >
              How it works
            </a>
            <a href="#demo" className="hover:text-white transition-colors">
              Live Demo
            </a>
            <a href="#pricing" className="hover:text-white transition-colors">
              Pricing
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-2"
            >
              Log In
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#00F0B5] text-[#020617] text-sm font-semibold rounded-full hover:bg-[#00dba5] hover:shadow-[0_0_24px_rgba(0,240,181,0.25)] transition-all duration-300"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section ref={heroRef} className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDI0MCwxODEsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-60" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#00F0B5]/[0.04] rounded-full blur-[100px]" />
        <div className="absolute top-40 -left-40 w-[400px] h-[400px] bg-[#00D4FF]/[0.03] rounded-full blur-[80px]" />
        <div className="absolute top-20 -right-40 w-[400px] h-[400px] bg-[#7c3aed]/[0.03] rounded-full blur-[80px]" />

        <div
          className={`relative max-w-4xl mx-auto px-4 pt-28 pb-24 text-center transition-all duration-1000 ease-out ${heroVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
        >
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 glass-card rounded-full mb-10 border border-[#00F0B5]/15">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]" />
            </span>
            <span className="text-sm text-[#00F0B5] font-medium tracking-wide">
              Scanning 37+ sources right now
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight">
            Never miss a <br className="hidden sm:block" />
            <span className="text-gradient">freelance gig</span> again
          </h1>

          <p className="mt-7 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            We scan Reddit, Craigslist, X/Twitter and 37+ sources every 2
            minutes to find freelance gigs that match your skills &mdash; so you
            can apply first and win more projects.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12">
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-[#00F0B5] text-[#020617] font-bold rounded-full hover:bg-[#00dba5] hover:shadow-[0_0_32px_rgba(0,240,181,0.3)] transition-all duration-300 text-base"
            >
              Start Scanning Free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 px-8 py-4 border border-white/10 text-gray-300 font-semibold rounded-full hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300 text-base"
            >
              See it in action
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 mt-14 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#00F0B5]/60" /> No credit card
              required
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#00F0B5]/60" /> Setup in 2 minutes
            </span>
            <span className="flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-[#00F0B5]/60" /> 37+ sources
              scanned
            </span>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section
        ref={statsRef}
        className="relative border-y border-white/[0.04] bg-[#0B1120]/40"
      >
        <div className="max-w-5xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "37+", label: "Sources Scanned" },
            { value: "2 min", label: "Scan Frequency" },
            { value: "34+", label: "Reddit Subs Monitored" },
            { value: "24/7", label: "Always-On Radar" },
          ].map(({ value, label }, i) => (
            <div
              key={label}
              className={`text-center transition-all duration-700 ease-out ${statsVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
              style={stagger(i)}
            >
              <p className="text-3xl sm:text-4xl font-extrabold text-gradient">
                {value}
              </p>
              <p className="text-sm text-gray-500 mt-1.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section ref={featRef} id="features" className="relative py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-center mb-16 transition-all duration-700 ease-out ${featVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Everything you need to{" "}
              <span className="text-gradient">land more gigs</span>
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              From intelligent gig scanning to quality scoring and instant
              alerts &mdash; built for freelancers who want to be first.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Radio,
                title: "Real-Time Gig Radar",
                description:
                  "We scan Reddit (34+ subs), Craigslist (10 cities), and X/Twitter every 2 minutes. New gigs show up in your feed within seconds of being posted.",
                accent: "from-[#00F0B5] to-[#00D4FF]",
              },
              {
                icon: Globe,
                title: "Multi-Platform Coverage",
                description:
                  "One dashboard for every opportunity. Reddit, Craigslist, X/Twitter and more \u2014 no more jumping between 10 tabs hunting for work.",
                accent: "from-orange-400 to-orange-500",
              },
              {
                icon: TrendingUp,
                title: "Gig Quality Scoring",
                description:
                  "Every gig is scored 0\u2013100 based on keyword match, budget, recency, and competition level. Focus on the gigs most likely to pay.",
                accent: "from-[#f59e0b] to-[#fbbf24]",
              },
              {
                icon: Bell,
                title: "Instant Notifications",
                description:
                  "Get browser push notifications the moment a matching gig appears. Early applicants get 3x more responses \u2014 speed wins.",
                accent: "from-blue-400 to-blue-500",
              },
              {
                icon: Search,
                title: "Smart Keyword Matching",
                description:
                  "Set keywords like \u201cReact developer\u201d or \u201clogo design\u201d and our AI matches you to the most relevant gigs automatically. No noise, just signal.",
                accent: "from-cyan-400 to-cyan-500",
              },
              {
                icon: Bookmark,
                title: "Save & Organize Gigs",
                description:
                  "Bookmark interesting gigs, track your application pipeline, and review saved opportunities from a single dashboard.",
                accent: "from-pink-400 to-rose-400",
              },
              {
                icon: Sparkles,
                title: "AI Proposal Generator",
                badge: "AI",
                description:
                  "One-click to generate a personalized proposal built from your real profile, skills, and past wins. Apply faster than anyone.",
                accent: "from-[#7c3aed] to-[#a78bfa]",
              },
              {
                icon: Trophy,
                title: "Win Rate Learning",
                description:
                  "Mark proposals as Won, Got Reply, or No Response. The AI studies your winning style and improves over time.",
                accent: "from-emerald-400 to-emerald-500",
              },
              {
                icon: UserCircle,
                title: "Freelancer Profile Hub",
                description:
                  "Build your profile with skills, bio, testimonials, and portfolio links. The AI uses it all to personalize every proposal.",
                accent: "from-indigo-400 to-indigo-500",
              },
            ].map((f, i) => (
              <div
                key={f.title}
                className={`transition-all duration-700 ease-out ${featVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={stagger(i)}
              >
                <FeatureCard {...f} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it Works ── */}
      <section
        ref={howRef}
        id="how-it-works"
        className="relative py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-center mb-16 transition-all duration-700 ease-out ${howVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Three steps to your{" "}
              <span className="text-gradient">next gig</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                emoji: "\ud83c\udfaf",
                title: "Set Your Keywords",
                desc: "Enter skills or roles you\u2019re looking for \u2014 \u201cReact developer\u201d, \u201clogo design\u201d, \u201cvideo editor\u201d. Our radar starts scanning 37+ sources immediately.",
              },
              {
                step: "02",
                emoji: "\u26a1",
                title: "Get Matched Instantly",
                desc: "We surface the most relevant gigs, scored by quality, budget, and keyword match. You get notified the moment something matches your skills.",
              },
              {
                step: "03",
                emoji: "\u2728",
                title: "Apply First & Win",
                desc: "Review the gig details, generate an AI-powered proposal in one click, and apply before the competition even sees the post.",
              },
            ].map(({ step, emoji, title, desc }, i) => (
              <div
                key={step}
                className={`relative group transition-all duration-700 ease-out ${howVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={stagger(i)}
              >
                <div className="glass-card rounded-2xl p-8 hover:border-[#00F0B5]/15 transition-all duration-300 h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-4xl">{emoji}</span>
                    <span className="text-4xl font-black text-gradient opacity-30 group-hover:opacity-60 transition-opacity">
                      {step}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live Demo ── */}
      <section
        ref={demoRef}
        id="demo"
        className="relative py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-center mb-16 transition-all duration-700 ease-out ${demoVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              Live Demo
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              See how gigs appear in real time
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              Set your keywords, and watch as matching gigs stream in from
              Reddit, Craigslist, and X/Twitter &mdash; scored and ranked
              automatically.
            </p>
          </div>
          <div
            className={`transition-all duration-700 ease-out delay-200 ${demoVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <LiveDemo />
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section
        ref={priceRef}
        id="pricing"
        className="relative py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-center mb-16 transition-all duration-700 ease-out ${priceVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              Start free, upgrade when you&apos;re ready. Cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free */}
            <div
              className={`glass-card rounded-2xl p-8 hover:border-white/10 transition-all duration-700 flex flex-col ${priceVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={stagger(0)}
            >
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white">Free</h3>
                <p className="text-gray-500 text-sm mt-1">
                  Get started instantly
                </p>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-extrabold text-white">$0</span>
                <span className="text-gray-500 text-sm ml-1">/month</span>
              </div>
              <ul className="space-y-3.5 mb-10 flex-1">
                <PricingFeature text="5 keyword alerts" />
                <PricingFeature text="Reddit scanning (34+ subs)" />
                <PricingFeature text="Craigslist scanning (10 cities)" />
                <PricingFeature text="Gig quality scoring" />
                <PricingFeature text="5 AI proposals per day" />
                <PricingFeature text="Browser notifications" />
              </ul>
              <Link
                to="/auth"
                className="block w-full text-center px-6 py-3.5 border border-white/10 text-gray-300 font-semibold rounded-xl hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300"
              >
                Get Started
              </Link>
            </div>

            {/* Pro */}
            <div
              className={`relative glass-card rounded-2xl p-8 border-[#00F0B5]/20 hover:border-[#00F0B5]/30 transition-all duration-700 flex flex-col glow-green ${priceVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={stagger(1)}
            >
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#00F0B5] text-[#020617] text-xs font-bold rounded-full">
                  <Star className="w-3 h-3" /> Most Popular
                </span>
              </div>
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white">Pro</h3>
                <p className="text-gray-500 text-sm mt-1">
                  For active freelancers
                </p>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-extrabold text-gradient">
                  $19
                </span>
                <span className="text-gray-500 text-sm ml-1">/month</span>
              </div>
              <ul className="space-y-3.5 mb-10 flex-1">
                <PricingFeature text="Unlimited keyword alerts" highlighted />
                <PricingFeature text="Everything in Free" highlighted />
                <PricingFeature
                  text="Priority scanning (every 1 min)"
                  highlighted
                />
                <PricingFeature text="X/Twitter source included" highlighted />
                <PricingFeature text="50 AI proposals per day" highlighted />
                <PricingFeature
                  text="Win rate learning (few-shot AI)"
                  highlighted
                />
                <PricingFeature
                  text="Competition signal analysis"
                  highlighted
                />
                <PricingFeature text="Email + push notifications" highlighted />
              </ul>
              <Link
                to="/auth"
                className="block w-full text-center px-6 py-3.5 bg-[#00F0B5] text-[#020617] font-bold rounded-xl hover:bg-[#00dba5] hover:shadow-[0_0_16px_rgba(0,240,181,0.2)] transition-all duration-300"
              >
                Upgrade to Pro
              </Link>
            </div>

            {/* Elite */}
            <div
              className={`glass-card rounded-2xl p-8 hover:border-white/10 transition-all duration-700 flex flex-col ${priceVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={stagger(2)}
            >
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white">Elite</h3>
                <p className="text-gray-500 text-sm mt-1">
                  For agencies & power users
                </p>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-extrabold text-white">$49</span>
                <span className="text-gray-500 text-sm ml-1">/month</span>
              </div>
              <ul className="space-y-3.5 mb-10 flex-1">
                <PricingFeature text="Everything in Pro" />
                <PricingFeature text="Unlimited AI proposals" />
                <PricingFeature text="Multi-user team access" />
                <PricingFeature text="Custom source integrations" />
                <PricingFeature text="Dedicated Discord support" />
                <PricingFeature text="API access" />
                <PricingFeature text="White-label proposals" />
              </ul>
              <Link
                to="/auth"
                className="block w-full text-center px-6 py-3.5 border border-white/10 text-gray-300 font-semibold rounded-xl hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section
        ref={proofRef}
        className="relative py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div
              className={`transition-all duration-700 ease-out ${proofVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-4">
                Why Freelancers Love Us
              </p>
              <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">
                Freelancers are landing{" "}
                <span className="text-gradient">$5k+ projects</span> by
                responding first.
              </h2>

              <div className="mt-10 space-y-5">
                <BenefitItem text="Be the first to see and apply to high-paying gigs" />
                <BenefitItem text="Save 10+ hours a week on manual prospecting" />
                <BenefitItem text="Cover Reddit, Craigslist & X/Twitter from one dashboard" />
                <BenefitItem text="Quality scores help you focus on gigs worth your time" />
                <BenefitItem text="Generate AI proposals and apply in under a minute" />
              </div>

              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 px-8 py-4 mt-12 bg-[#00F0B5] text-[#020617] font-bold rounded-full hover:bg-[#00dba5] hover:shadow-[0_0_32px_rgba(0,240,181,0.3)] transition-all duration-300 text-base"
              >
                Start Scanning Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div
              className={`space-y-5 transition-all duration-700 ease-out delay-200 ${proofVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              <TestimonialCard
                quote="GigAlertPro found a Reddit post looking for a designer 3 minutes after it went live. I applied first and closed a $3,000 project that same day."
                name="Sarah J."
                role="UI Designer"
                initials="SJ"
                color="from-yellow-400 to-orange-400"
              />
              <TestimonialCard
                quote="I used to spend 2 hours a day scrolling Reddit and Craigslist for leads. Now I get notified instantly and only see gigs that actually match my skills."
                name="Marcus T."
                role="React Developer"
                initials="MT"
                color="from-[#00F0B5] to-[#00D4FF]"
              />
              <TestimonialCard
                quote="The gig quality scoring is a game changer. I stopped wasting time on lowball posts and applied to a $6K Shopify rebuild 8 minutes after it was posted."
                name="Alex K."
                role="Full-Stack Dev"
                initials="AK"
                color="from-[#7c3aed] to-[#a78bfa]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section ref={ctaRef} className="relative py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div
            className={`glass-card rounded-3xl p-12 sm:p-16 relative overflow-hidden transition-all duration-700 ease-out ${ctaVis ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#00F0B5]/[0.06] to-[#00D4FF]/[0.03]" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                Stop searching. Start getting matched.
              </h2>
              <p className="text-gray-400 text-lg max-w-lg mx-auto mb-8">
                Join thousands of freelancers who find better gigs faster with
                real-time scanning across 37+ sources.
              </p>
              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 px-8 py-4 bg-[#00F0B5] text-[#020617] font-bold rounded-full hover:bg-[#00dba5] hover:shadow-[0_0_32px_rgba(0,240,181,0.3)] transition-all duration-300 text-base"
              >
                Start Scanning Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <p className="text-xs text-gray-500 mt-4">
                No credit card required. Free forever plan available.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.04] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight mb-3">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#00F0B5] to-[#00D4FF] flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-[#020617]" />
                </div>
                <span>
                  GigAlert<span className="text-gradient">Pro</span>
                </span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                Real-time freelance gig scanner. We find the opportunities
                &mdash; you close the deals.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-300 mb-3">
                Product
              </p>
              <div className="space-y-2 text-sm text-gray-500">
                <a
                  href="#features"
                  className="block hover:text-gray-300 transition-colors"
                >
                  Features
                </a>
                <a
                  href="#how-it-works"
                  className="block hover:text-gray-300 transition-colors"
                >
                  How it works
                </a>
                <a
                  href="#pricing"
                  className="block hover:text-gray-300 transition-colors"
                >
                  Pricing
                </a>
                <a
                  href="#demo"
                  className="block hover:text-gray-300 transition-colors"
                >
                  Live Demo
                </a>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-300 mb-3">
                For Freelancers
              </p>
              <div className="space-y-2 text-sm text-gray-500">
                <span className="block">Web Developers</span>
                <span className="block">Graphic Designers</span>
                <span className="block">Copywriters</span>
                <span className="block">Mobile App Developers</span>
                <span className="block">Virtual Assistants</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-300 mb-3">Legal</p>
              <div className="space-y-2 text-sm text-gray-500">
                <Link
                  to="/landing"
                  className="block hover:text-gray-300 transition-colors"
                >
                  Privacy Policy
                </Link>
                <Link
                  to="/landing"
                  className="block hover:text-gray-300 transition-colors"
                >
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
          <div className="pt-8 border-t border-white/[0.04] text-center">
            <p className="text-sm text-gray-600">
              &copy; {new Date().getFullYear()} GigAlertPro. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   LIVE DEMO — simulates the gig scanning / discovery feed
   ═══════════════════════════════════════════════════════════════════════ */
function LiveDemo() {
  const [scanning, setScanning] = useState(false);
  const [visibleGigs, setVisibleGigs] = useState([]);
  const [selectedGig, setSelectedGig] = useState(null);

  function handleScan() {
    if (scanning) return;
    setScanning(true);
    setVisibleGigs([]);
    setSelectedGig(null);

    // Stream gigs in one-by-one
    DEMO_GIGS.forEach((gig, i) => {
      setTimeout(
        () => {
          setVisibleGigs((prev) => [...prev, gig]);
          if (i === 0) setSelectedGig(gig);
        },
        800 + i * 600,
      );
    });

    setTimeout(() => setScanning(false), 800 + DEMO_GIGS.length * 600 + 200);
  }

  const active = selectedGig || DEMO_GIGS[0];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Panel 1: Keywords & Scan */}
        <div className="lg:col-span-3 glass-card rounded-2xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-4 h-4 text-[#00F0B5]" />
            <h3 className="text-sm font-bold text-white">Your Keywords</h3>
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
            {DEMO_KEYWORDS.map((k) => (
              <span
                key={k.label}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${k.color}`}
              >
                {k.label}
              </span>
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={handleScan}
            disabled={scanning}
            className="w-full py-3 bg-[#00F0B5] text-[#020617] text-sm font-bold rounded-xl hover:bg-[#00dba5] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {scanning ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#020617] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#020617]" />
                </span>
                Scanning...
              </>
            ) : visibleGigs.length > 0 ? (
              "Scan Again"
            ) : (
              "Start Scanning"
            )}
          </button>
        </div>

        {/* Panel 2: Gig Feed */}
        <div className="lg:col-span-5 glass-card rounded-2xl p-5 flex flex-col min-h-[380px]">
          <div className="flex items-center gap-2 mb-4">
            <Radio className="w-4 h-4 text-[#00F0B5]" />
            <h3 className="text-sm font-bold text-white">Gig Feed</h3>
            {scanning && (
              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[#00F0B5] font-medium">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00F0B5]" />
                </span>
                Live
              </span>
            )}
            {!scanning && visibleGigs.length > 0 && (
              <span className="ml-auto text-[11px] text-gray-500">
                {visibleGigs.length} gigs found
              </span>
            )}
          </div>

          {visibleGigs.length === 0 && !scanning ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              Click &quot;Start Scanning&quot; to find gigs
            </div>
          ) : visibleGigs.length === 0 && scanning ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <Radio className="w-6 h-6 text-[#00F0B5] animate-pulse" />
              <p className="text-sm text-gray-400">Scanning sources...</p>
            </div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {visibleGigs.map((gig) => (
                <button
                  key={gig.id}
                  onClick={() => setSelectedGig(gig)}
                  className={`w-full text-left p-3 rounded-xl border transition-all duration-200 animate-slideIn ${
                    selectedGig?.id === gig.id
                      ? "bg-[#00F0B5]/[0.06] border-[#00F0B5]/20"
                      : "bg-white/[0.02] border-white/[0.04] hover:border-white/[0.08]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-semibold text-white leading-snug line-clamp-1">
                      {gig.title}
                    </h4>
                    <span
                      className={`text-lg font-extrabold shrink-0 ${gig.score >= 85 ? "text-[#00F0B5]" : gig.score >= 70 ? "text-yellow-400" : "text-gray-500"}`}
                    >
                      {gig.score}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`text-[10px] font-semibold ${gig.sourceColor}`}
                    >
                      {gig.source}
                    </span>
                    <span className="text-[10px] text-gray-600">&middot;</span>
                    <span className="text-[10px] text-gray-500">{gig.sub}</span>
                    <span className="text-[10px] text-gray-600">&middot;</span>
                    <span className="text-[10px] text-gray-500">
                      {gig.time}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Panel 3: Gig Details */}
        <div className="lg:col-span-4 glass-card rounded-2xl p-5 flex flex-col min-h-[380px]">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-bold text-white">Gig Details</h3>
          </div>

          {!selectedGig ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              Select a gig to see details
            </div>
          ) : (
            <div className="space-y-5 flex-1">
              <div>
                <h4 className="text-sm font-bold text-white leading-snug mb-1">
                  {active.title}
                </h4>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={`font-semibold ${active.sourceColor}`}>
                    {active.source}
                  </span>
                  <span className="text-gray-600">&middot;</span>
                  <span className="text-gray-500">{active.sub}</span>
                  <span className="text-gray-600">&middot;</span>
                  <span className="text-gray-500">{active.time}</span>
                </div>
              </div>

              {/* Quality Score */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">
                    Match Score
                  </span>
                  <span className="text-2xl font-extrabold text-[#00F0B5]">
                    {active.score}
                  </span>
                </div>
                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00F0B5] to-[#00D4FF] rounded-full transition-all duration-700"
                    style={{ width: `${active.score}%` }}
                  />
                </div>
              </div>

              {/* Budget */}
              <div>
                <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">
                  Budget
                </span>
                <p className="text-sm font-semibold text-white mt-1">
                  {active.budget}
                </p>
              </div>

              {/* Keywords */}
              <div>
                <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-2 block">
                  Matched Keywords
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {active.keywords.map((k) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 bg-[#00F0B5]/[0.08] border border-[#00F0B5]/15 text-[#00F0B5] text-[11px] font-medium rounded-md"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>

              {/* Upvotes */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {active.upvotes} upvotes
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

function FeatureCard({ icon: Icon, title, description, badge, accent }) {
  return (
    <div className="group glass-card rounded-2xl p-7 hover:border-[#00F0B5]/15 transition-all duration-300 relative overflow-hidden h-full">
      <div
        className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
      />
      <div className="flex items-start justify-between mb-6">
        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center opacity-90`}
        >
          <Icon className="w-6 h-6 text-[#020617]" />
        </div>
        {badge && (
          <span className="px-2.5 py-1 bg-white/[0.06] text-gray-300 text-xs font-semibold rounded-full border border-white/[0.06]">
            {badge}
          </span>
        )}
      </div>
      <h3 className="text-lg font-bold mb-2 text-white">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function PricingFeature({ text, highlighted }) {
  return (
    <li className="flex items-center gap-3">
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${highlighted ? "bg-[#00F0B5]/15 text-[#00F0B5]" : "bg-white/[0.06] text-gray-400"}`}
      >
        <Check className="w-3 h-3" />
      </div>
      <span className={highlighted ? "text-gray-200" : "text-gray-400"}>
        {text}
      </span>
    </li>
  );
}

function BenefitItem({ text }) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="w-6 h-6 rounded-full bg-[#00F0B5]/10 flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-4 h-4 text-[#00F0B5]" />
      </div>
      <span className="text-gray-300">{text}</span>
    </div>
  );
}

function TestimonialCard({ quote, name, role, initials, color }) {
  return (
    <div className="glass-card rounded-2xl p-6 relative hover:border-white/10 transition-all duration-300">
      <Quote className="w-5 h-5 text-[#00F0B5]/20 absolute top-6 right-6" />
      <p className="text-gray-300 leading-relaxed mb-5 pr-6">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-full bg-gradient-to-br ${color} flex items-center justify-center`}
        >
          <span className="text-xs font-bold text-[#020617]">{initials}</span>
        </div>
        <div>
          <p className="font-semibold text-sm text-white">{name}</p>
          <p className="text-xs text-gray-500">{role}</p>
        </div>
      </div>
    </div>
  );
}
