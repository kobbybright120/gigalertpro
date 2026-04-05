import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PAYMENTS_ENABLED } from "../../payments.config.js";
import {
  Zap,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Shield,
  Clock,
  Check,
  Star,
  Bell,
  Trophy,
  TrendingUp,
  Search,
  Globe,
  Radio,
  ChevronDown,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
  SCROLL-REVEAL HOOK: fade-in + slide-up on viewport entry
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

/* Stagger helper: returns Tailwind delay class */
const stagger = (i) => {
  const ms = i * 100;
  return { transitionDelay: `${ms}ms` };
};

/* ═══════════════════════════════════════════════════════════════════════
  LIVE DEMO DATA: simulates the gig-scanning & discovery flow
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
    budget: "$4,000 to $6,000",
    score: 92,
    time: "2 min ago",
    keywords: ["React", "TypeScript", "API"],
    upvotes: 8,
    proposal:
      "Your analytics dashboard needs to do more than render charts, it needs to help your team act on data in real time. I\u2019ve built three SaaS dashboards with live Stripe and Segment integrations, and the last one cut manual reporting by 80%.\n\nHere\u2019s how I\u2019d approach yours:\n\n\u2022 React + TypeScript frontend with type-safe API models\n\u2022 WebSocket-powered real-time charts, no page refreshes\n\u2022 Role-based user management with granular permissions\n\u2022 Fully responsive, delivered in 3 weeks with a recorded walkthrough\n\nA fintech client\u2019s dashboard I built handles 50K+ daily events, their team ditched spreadsheets within a week.\n\nWhat\u2019s your timeline for getting this in front of your team?",
  },
  {
    id: 2,
    title: "Need a Modern Logo for Fitness App",
    source: "Craigslist",
    sourceColor: "text-violet-400",
    sub: "New York",
    budget: "$800 to $1,200",
    score: 78,
    time: "5 min ago",
    keywords: ["Logo Design", "Branding"],
    upvotes: 3,
    proposal:
      "A heartbeat motif can either feel generic or become the visual hook people instantly associate with FitPulse. The difference is in how you abstract it.\n\nI\u2019ve designed logos for three health & wellness apps. The best-performing one used a dynamic pulse wave built into the lettermark itself, it read as \u201cenergy\u201d without being obvious.\n\nHere\u2019s what I\u2019d deliver:\n\n\u2022 3 distinct concepts, minimal to bold\n\u2022 App-store-optimized icon version\n\u2022 Dark/light variants + one-color for merch\n\u2022 Brand guideline PDF with spacing & color codes\n\nWant to start with a quick 15-min call to nail the vibe?",
  },
  {
    id: 3,
    title: "Full-Stack Dev for Headless Shopify Rebuild",
    source: "Reddit",
    sourceColor: "text-orange-400",
    sub: "r/freelance",
    budget: "$6,000 to $10,000",
    score: 95,
    time: "8 min ago",
    keywords: ["Shopify", "Next.js", "Performance"],
    upvotes: 24,
    proposal:
      "Your checkout flow is likely losing more customers than analytics show. I rebuilt a similar Shopify store headless with Next.js last quarter, Lighthouse went from 34 to 96, and conversions jumped 42% in month one.\n\nMy approach:\n\n\u2022 Audit your Shopify analytics to find exact drop-off points\n\u2022 Next.js storefront with ISR, product pages under 1 second\n\u2022 Single-page checkout with Apple Pay & Google Pay\n\u2022 A/B testing baked in so you measure the lift with real data\n\nI can have a working prototype in 10 days.\n\nShould we start with a call to look at your current analytics together?",
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
    proposal:
      "The first 8 seconds of a YouTube video decide whether someone stays or bounces. I edit with that in mind, punchy cold opens, tight cuts, and on-brand motion graphics that keep viewers watching.\n\nI\u2019ve edited 120+ videos for tech and lifestyle channels, averaging 65%+ audience retention.\n\nWhat I\u2019d deliver per video:\n\n\u2022 Jump-cut editing with dynamic pacing\n\u2022 Custom lower-thirds, transitions & thumbnails\n\u2022 Color grading + audio cleanup\n\u2022 48-hour turnaround on first drafts\n\nWant to send me a raw clip so I can show you a sample edit?",
  },
  {
    id: 5,
    title: "WordPress Developer for Agency Site",
    source: "Reddit",
    sourceColor: "text-orange-400",
    sub: "r/hiring",
    budget: "$2,000 to $3,500",
    score: 84,
    time: "15 min ago",
    keywords: ["WordPress", "PHP"],
    upvotes: 11,
    proposal:
      "Agency sites need to do two things well: load fast and convert visitors into booked calls. Most WordPress builds fail at both.\n\nI\u2019ve built 15+ agency sites on WordPress, the last one cut page load from 4.2s to 1.1s and increased contact form submissions by 35%.\n\nHere\u2019s my plan:\n\n\u2022 Custom theme built on a lightweight starter, no bloated page builders\n\u2022 Mobile-first responsive design\n\u2022 SEO-optimized with schema markup and Core Web Vitals in the green\n\u2022 Delivered in 2 weeks with a CMS training walkthrough\n\nCan we hop on a quick call to look at your current site and discuss goals?",
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { user } = useAuth();

  async function handleCheckout(period) {
    if (!PAYMENTS_ENABLED) {
      // Payments disabled: fall back to auth/signup
      window.location.href = "/auth";
      return;
    }

    try {
      const res = await fetch("/api/create-paystack-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          email: user?.email ?? undefined,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout error:", data.error);
        // Fallback to auth page if Paystack not yet configured
        window.location.href = "/auth";
      }
    } catch {
      window.location.href = "/auth";
    }
  }

  /* Section refs for scroll-reveal */
  const [heroRef, heroVis] = useReveal(0.1);
  const [statsRef, statsVis] = useReveal();
  const [featRef, featVis] = useReveal(0.08);
  const [howRef, howVis] = useReveal();
  const [demoRef, demoVis] = useReveal(0.08);
  const [priceRef, priceVis] = useReveal(0.08);
  const [proofRef, proofVis] = useReveal(0.08);
  const [faqRef, faqVis] = useReveal(0.08);
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
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#00F0B5] text-[#020617] text-sm font-semibold rounded-lg hover:bg-[#00dba5] transition-all duration-200"
            >
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section ref={heroRef} className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-5%,rgba(0,240,181,0.06)_0%,transparent_100%)]" />

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
              Scanning Reddit, Craigslist & X right now
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight">
            You're losing gigs <br className="hidden sm:block" />
            <span className="text-gradient">while you sleep. We fix that.</span>
          </h1>

          <p className="mt-7 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Reddit gig posts get 20+ applicants in the first 10 minutes.
            GigAlertPro sends you instant alerts within seconds of posting, so
            you apply first, not last. Try it free.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12">
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-[#00F0B5] text-[#020617] font-bold rounded-lg hover:bg-[#00dba5] transition-all duration-200 text-base"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 px-8 py-4 border border-white/10 text-gray-300 font-semibold rounded-full hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300 text-base"
            >
              See it in action
            </a>
          </div>

          <p className="mt-5 text-sm text-gray-500">
            🔒 No credit card. No spam. Takes 45 seconds to set up.
          </p>

          {/* Social proof: avatar stack */}
          <div className="flex items-center justify-center gap-3 mt-14">
            <div className="flex -space-x-2.5">
              {[
                "https://randomuser.me/api/portraits/women/44.jpg",
                "https://randomuser.me/api/portraits/men/32.jpg",
                "https://randomuser.me/api/portraits/men/68.jpg",
                "https://randomuser.me/api/portraits/women/65.jpg",
                "https://randomuser.me/api/portraits/men/45.jpg",
              ].map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt="freelancer"
                  className="w-8 h-8 rounded-full border-2 border-[#020617] object-cover"
                />
              ))}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400"
                  />
                ))}
              </div>
              <p className="text-sm text-gray-400">
                Joined by{" "}
                <span className="text-white font-semibold">2,400+</span>{" "}
                freelancers on Reddit, Craigslist & X
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 mt-8 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#00F0B5]/60" /> No credit card
              required
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#00F0B5]/60" /> Setup in 45
              seconds
            </span>
            <span className="flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-[#00F0B5]/60" /> Cancel anytime
            </span>
          </div>
        </div>
      </section>

      {/* ── Problem Strip ── */}
      <section className="relative border-y border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-4 py-5 text-center">
          <p className="text-sm sm:text-base text-gray-400">
            Reddit gig posts get{" "}
            <span className="text-white font-semibold">
              20+ applicants in the first 10 minutes.
            </span>{" "}
            If you&apos;re not first, you&apos;re invisible.
          </p>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section
        ref={statsRef}
        className="relative border-b border-white/[0.04] bg-[#0B1120]/40"
      >
        <div className="max-w-6xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "37+", label: "Sources Scanned" },
            { value: "$2.4M+", label: "In Projects Discovered" },
            { value: "34+", label: "Reddit Subs Monitored" },
            { value: "24/7", label: "Always-On Radar" },
          ].map(({ value, label }, i) => (
            <div
              key={label}
              className={`text-center transition-all duration-700 ease-out ${statsVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
              style={stagger(i)}
            >
              <p className="text-3xl sm:text-4xl font-extrabold text-white">
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
              Not just alerts.{" "}
              <span className="text-[#00F0B5]">
                A complete system for winning gigs.
              </span>
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              Everything you need to find, evaluate, and win freelance gigs
              before your competition even opens their browser.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Radio,
                title: "Real-Time Gig Radar",
                description:
                  "We scan Reddit, Craigslist, and X every 2 minutes. You see gigs within seconds of being posted, not hours later. Early applicants get 3x more responses.",
                accent: "from-[#00F0B5] to-[#00D4FF]",
              },
              {
                icon: Globe,
                title: "Multi-Platform Coverage",
                description:
                  "Reddit (34+ subs), Craigslist (10 cities), X/Twitter, all in one dashboard. Stop wasting 2+ hours a day jumping between tabs. One feed covers everything.",
                accent: "from-orange-400 to-orange-500",
              },
              {
                icon: TrendingUp,
                title: "Gig Quality Scoring",
                description:
                  "Every gig gets a 0 to 100 score based on budget, keyword match, and competition level. Freelancers who focus on high-score gigs close 2x more deals.",
                accent: "from-[#f59e0b] to-[#fbbf24]",
              },
              {
                icon: Bell,
                title: "Instant Alerts",
                description:
                  "Get an instant alert the second a matching gig appears. No more refreshing feeds. Our fastest users apply within 3 minutes and consistently win the project.",
                accent: "from-blue-400 to-blue-500",
              },
              {
                icon: Sparkles,
                title: "AI Proposal Generator",
                badge: "AI",
                description:
                  "One click generates a personalized, ready-to-send proposal built from your profile, skills, and past wins. Apply 10x faster than writing from scratch.",
                accent: "from-[#7c3aed] to-[#a78bfa]",
              },
              {
                icon: Trophy,
                title: "Win Rate Learning",
                description:
                  "Mark proposals as Won, Got Reply, or No Response. The AI studies your winning patterns and writes sharper proposals over time. Users report 2x higher win rates after 30 days.",
                accent: "from-emerald-400 to-emerald-500",
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
              Three steps.{" "}
              <span className="text-[#00F0B5]">Apply first. Win.</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                emoji: "\ud83c\udfaf",
                title: "Tell Us What You Do",
                desc: "Enter your skills like \u201cReact developer\u201d, \u201clogo design\u201d, or \u201cvirtual assistant.\u201d Our radar starts scanning 37+ sources across Reddit, Craigslist, and X immediately. Takes 45 seconds.",
              },
              {
                step: "02",
                emoji: "\u26a1",
                title: "Get Alerted Instantly",
                desc: "The moment a matching gig is posted, you get an instant alert. No refreshing. No scrolling. Every gig is scored 0 to 100 so you know which ones are worth your time.",
              },
              {
                step: "03",
                emoji: "\u2728",
                title: "Apply First & Close the Deal",
                desc: "Generate an AI-powered proposal in one click, copy it, and DM the client. While others are still browsing Reddit, you\u2019ve already sent your pitch. First reply wins 80% of the time.",
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
                    <span className="text-4xl font-black text-[#00F0B5]/30 group-hover:text-[#00F0B5]/60 transition-colors">
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
              Reddit, Craigslist, and X/Twitter, scored and ranked
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
              One plan. Everything included.{" "}
              <span className="text-[#00F0B5]">No surprises.</span>
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              Start your free trial today. No credit card required. Cancel
              anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Monthly */}
            <div
              className={`glass-card rounded-2xl p-8 hover:border-white/10 flex flex-col transition-all duration-700 ease-out ${priceVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={stagger(0)}
            >
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white">Monthly</h3>
                <p className="text-gray-500 text-sm mt-1">Billed every month</p>
              </div>
              <div className="mb-8">
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-extrabold text-white">
                    $20
                  </span>
                  <span className="text-gray-500 text-sm pb-2">/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                <PricingFeature text="Unlimited keyword alerts" />
                <PricingFeature text="Reddit, Craigslist & X/Twitter" />
                <PricingFeature text="Real-time gig scanning" />
                <PricingFeature text="Gig quality scoring" />
                <PricingFeature text="50 AI proposals per day" />
                <PricingFeature text="Instant alerts + email notifications" />
                <PricingFeature text="Freelancer profile hub" />
              </ul>
              <button
                onClick={() => handleCheckout("monthly")}
                className="w-full py-3.5 border border-white/10 text-gray-300 font-semibold rounded-xl hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300 flex items-center justify-center gap-2"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-xs text-gray-600 text-center mt-3">
                No credit card required. Cancel anytime.
              </p>
            </div>

            {/* Yearly */}
            <div
              className={`relative glass-card rounded-2xl p-8 border-[#00F0B5]/20 hover:border-[#00F0B5]/30 glow-green flex flex-col transition-all duration-700 ease-out ${priceVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={stagger(1)}
            >
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#00F0B5] text-[#020617] text-xs font-bold rounded-full">
                  <Star className="w-3 h-3" /> Most Popular · Save $48/yr
                </span>
              </div>
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white">Yearly</h3>
                <p className="text-gray-500 text-sm mt-1">Billed once a year</p>
              </div>
              <div className="mb-8">
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-extrabold text-white">
                    $16
                  </span>
                  <span className="text-gray-500 text-sm pb-2">/month</span>
                </div>
                <p className="text-sm text-gray-500 mt-1.5">
                  Billed as{" "}
                  <span className="text-[#00F0B5] font-semibold">
                    $192/year
                  </span>
                  <span className="ml-2 line-through text-gray-600">$240</span>
                </p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                <PricingFeature text="Everything in Monthly" highlighted />
                <PricingFeature text="2 months free" highlighted />
                <PricingFeature text="Unlimited keyword alerts" highlighted />
                <PricingFeature
                  text="Reddit, Craigslist & X/Twitter"
                  highlighted
                />
                <PricingFeature text="Real-time gig scanning" highlighted />
                <PricingFeature text="Gig quality scoring" highlighted />
                <PricingFeature text="50 AI proposals per day" highlighted />
                <PricingFeature
                  text="Instant alerts + email notifications"
                  highlighted
                />
                <PricingFeature text="Freelancer profile hub" highlighted />
              </ul>
              <button
                onClick={() => handleCheckout("yearly")}
                className="w-full py-3.5 bg-[#00F0B5] text-[#020617] font-bold rounded-xl hover:bg-[#00dba5] transition-all duration-200 flex items-center justify-center gap-2"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-xs text-gray-600 text-center mt-3">
                No credit card required. Cancel anytime.
              </p>
            </div>
          </div>

          <p className="text-center text-sm text-gray-500 mt-8">
            Questions?{" "}
            <a
              href="mailto:support@gigalertpro.com"
              className="text-[#00F0B5] hover:underline"
            >
              Contact us
            </a>
            . We reply within 24 hours.
          </p>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section
        ref={proofRef}
        className="relative py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Results metrics bar */}
          <div
            className={`glass-card rounded-2xl p-8 mb-16 transition-all duration-700 ease-out ${proofVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { value: "2,400+", label: "Active Freelancers" },
                { value: "$2.4M+", label: "Projects Discovered" },
                { value: "10hrs+", label: "Saved Per Week" },
                { value: "4.9/5", label: "Average Rating" },
              ].map(({ value, label }, i) => (
                <div key={label} style={stagger(i)}>
                  <p className="text-2xl sm:text-3xl font-extrabold text-white">
                    {value}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div
              className={`transition-all duration-700 ease-out ${proofVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-4">
                Real Results
              </p>
              <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">
                Freelancers are closing{" "}
                <span className="text-[#00F0B5]">$5K+ deals</span> by showing up
                first.
              </h2>

              <div className="mt-10 space-y-5">
                <BenefitItem text="Apply to gigs 10x faster than manual searching" />
                <BenefitItem text="Save 10+ hours a week on prospecting" />
                <BenefitItem text="Cover Reddit, Craigslist & X/Twitter from one dashboard" />
                <BenefitItem text="Quality scores help you skip lowball posts" />
                <BenefitItem text="AI proposals that sound like you, not a template" />
              </div>

              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 px-8 py-4 mt-12 bg-[#00F0B5] text-[#020617] font-bold rounded-lg hover:bg-[#00dba5] transition-all duration-200 text-base"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div
              className={`space-y-5 transition-all duration-700 ease-out delay-200 ${proofVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              <TestimonialCard
                quote="Got an alert 3 minutes after someone posted on r/forhire looking for a designer. Applied immediately. Closed a $3,000 project that same afternoon. Without this tool I never would've seen that post."
                name="Sarah J."
                role="UI Designer"
                amount="$3,000"
                img="https://randomuser.me/api/portraits/women/44.jpg"
                initials="SJ"
                color="from-yellow-400 to-orange-400"
                rating={5}
              />
              <TestimonialCard
                quote="I was spending 2 hours a day refreshing Reddit and Craigslist. Now I just wait for the ping. Landed $8,000 in new work my first month. Honestly can’t believe I used to do this manually."
                name="Marcus T."
                role="React Developer"
                amount="$8,000"
                img="https://randomuser.me/api/portraits/men/32.jpg"
                initials="MT"
                color="from-[#00F0B5] to-[#00D4FF]"
                rating={5}
              />
              <TestimonialCard
                quote="The AI proposal thing is insane. I saw a $6,000 Shopify rebuild on Reddit, hit generate, tweaked two sentences, and sent it. Got the gig 8 minutes after it was posted. The subscription paid for itself day one."
                name="Alex K."
                role="Full-Stack Dev"
                amount="$6,000"
                img="https://randomuser.me/api/portraits/men/68.jpg"
                initials="AK"
                color="from-[#7c3aed] to-[#a78bfa]"
                rating={5}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section
        ref={faqRef}
        className="relative py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-center mb-16 transition-all duration-700 ease-out ${faqVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              FAQ
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Got questions? We've got answers.
            </h2>
          </div>
          <div className="space-y-3">
            {[
              {
                q: "How fast do gigs actually show up?",
                a: "Fast. We scan Reddit, Craigslist, and X every 1 to 2 minutes. Most gigs appear in your feed within seconds of being posted on the original platform. You'll get an instant alert with no refreshing, no checking back. Our fastest users apply within 3 minutes of a gig going live.",
                defaultOpen: true,
              },
              {
                q: "How is this different from Upwork or Fiverr?",
                a: "On Upwork and Fiverr, you\u2019re competing with 50 to 100 other freelancers on every posted job. By the time you see it, the client is already drowning in proposals. GigAlertPro scans places most freelancers never check: Reddit subs, Craigslist gigs, X/Twitter posts. It alerts you in seconds. You\u2019re often the first or second person to reply. That\u2019s how you win.",
                defaultOpen: true,
              },
              {
                q: "What sources does GigAlertPro scan?",
                a: "We scan 37+ sources including Reddit (34+ subreddits like r/forhire, r/freelance, r/hiring), Craigslist (10 major cities), and X/Twitter freelance accounts. New sources are added regularly. One dashboard replaces hours of manual searching.",
              },
              {
                q: "What does the AI proposal generator do?",
                a: "It writes a personalized, ready-to-send proposal in one click. It pulls from your profile, skills, and past wins to craft something that sounds like you, not a generic template. Freelancers report applying 10x faster. You generate, tweak a sentence or two, and send. Done.",
              },
              {
                q: "Can I cancel anytime?",
                a: "Yes. One click from your account settings. No questions, no hidden fees, no guilt trips. Your free trial is completely commitment-free. If it\u2019s not for you, cancel and you won\u2019t be charged a cent.",
              },
            ].map(({ q, a, defaultOpen }, i) => (
              <FaqItem
                key={i}
                question={q}
                answer={a}
                visible={faqVis}
                index={i}
                defaultOpen={defaultOpen}
              />
            ))}
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
                Someone just posted your perfect gig. Are you going to see it?
              </h2>
              <p className="text-gray-400 text-lg max-w-lg mx-auto mb-8">
                Every minute you're not using GigAlertPro, another freelancer is
                applying first. Stop losing gigs you should be winning.
              </p>
              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 px-8 py-4 bg-[#00F0B5] text-[#020617] font-bold rounded-lg hover:bg-[#00dba5] transition-all duration-200 text-base"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <p className="text-sm text-gray-500 mt-5">
                Join 2,400+ freelancers already landing gigs with GigAlertPro
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
                Real-time freelance gig scanner. We find the opportunities, you
                close the deals.
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
  LIVE DEMO: full flow: scan → feed → details → generate proposal
  ═══════════════════════════════════════════════════════════════════════ */
function LiveDemo() {
  const [scanning, setScanning] = useState(false);
  const [visibleGigs, setVisibleGigs] = useState([]);
  const [selectedGig, setSelectedGig] = useState(null);
  const [proposalPhase, setProposalPhase] = useState("idle");
  const [proposalText, setProposalText] = useState("");
  const [typingDone, setTypingDone] = useState(false);

  function handleScan() {
    if (scanning) return;
    setScanning(true);
    setVisibleGigs([]);
    setSelectedGig(null);
    setProposalPhase("idle");
    setProposalText("");
    setTypingDone(false);

    DEMO_GIGS.forEach((gig, i) => {
      setTimeout(
        () => {
          setVisibleGigs((prev) => [...prev, gig]);
        },
        800 + i * 600,
      );
    });

    const scanEnd = 800 + DEMO_GIGS.length * 600 + 200;
    setTimeout(() => setScanning(false), scanEnd);
    setTimeout(() => setSelectedGig(DEMO_GIGS[0]), scanEnd + 300);
  }

  function handleSelectGig(gig) {
    setSelectedGig(gig);
    setProposalPhase("idle");
    setProposalText("");
    setTypingDone(false);
  }

  // Typing effect for proposal
  useEffect(() => {
    if (proposalPhase !== "done" || !selectedGig) return;
    setTypingDone(false);
    let i = 0;
    const text = selectedGig.proposal;
    setProposalText("");
    const id = setInterval(() => {
      i += 2;
      if (i >= text.length) {
        setProposalText(text);
        setTypingDone(true);
        clearInterval(id);
      } else {
        setProposalText(text.slice(0, i));
      }
    }, 10);
    return () => clearInterval(id);
  }, [proposalPhase, selectedGig]);

  function handleGenerate() {
    if (!selectedGig) return;
    setProposalPhase("generating");
    setTimeout(() => setProposalPhase("done"), 1500);
  }

  const active = selectedGig;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Row 1: Keywords + Gig Feed + Gig Details */}
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
                  onClick={() => handleSelectGig(gig)}
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

        {/* Panel 3: Gig Details + Generate Proposal */}
        <div className="lg:col-span-4 glass-card rounded-2xl p-5 flex flex-col min-h-[380px]">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-bold text-white">Gig Details</h3>
          </div>

          {!active ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              Select a gig to see details
            </div>
          ) : (
            <div className="space-y-4 flex-1 flex flex-col">
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

              {/* Match Score */}
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
                <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5 block">
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

              {/* Generate Proposal Button */}
              <div className="flex-1" />
              <button
                onClick={handleGenerate}
                disabled={proposalPhase !== "idle"}
                className="w-full py-3 bg-gradient-to-r from-[#7c3aed] to-[#a78bfa] text-white text-sm font-bold rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {proposalPhase === "idle"
                  ? "Generate Proposal"
                  : proposalPhase === "generating"
                    ? "Generating..."
                    : "Proposal Ready ✓"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Generated Proposal (slides in after generation) */}
      {proposalPhase !== "idle" && (
        <div className="mt-5 animate-slideIn">
          <div className="glass-card rounded-2xl p-6 border-[#7c3aed]/20">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white">
                Your Ready-to-Send Proposal
              </h3>
              <span className="ml-auto px-2.5 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] font-semibold rounded-md uppercase tracking-wider border border-purple-500/20">
                AI Generated
              </span>
            </div>

            {proposalPhase === "generating" ? (
              <div className="flex items-center justify-center py-8 gap-3">
                <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400">
                  Crafting your personalized proposal...
                </p>
              </div>
            ) : (
              <div>
                <div className="bg-[#020617]/60 border border-white/[0.06] rounded-xl p-5">
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                    {proposalText}
                    {!typingDone && (
                      <span className="inline-block w-0.5 h-4 bg-purple-400 animate-pulse ml-0.5 align-text-bottom" />
                    )}
                  </p>
                </div>
                {typingDone && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-4 text-[11px] text-gray-500">
                      <span>
                        Tone:{" "}
                        <span className="text-gray-300">Professional</span>
                      </span>
                      <span>
                        Words:{" "}
                        <span className="text-gray-300">
                          {selectedGig.proposal.split(/\s+/).length}
                        </span>
                      </span>
                    </div>
                    <span className="px-3 py-1.5 bg-[#00F0B5]/10 text-[#00F0B5] text-xs font-semibold rounded-lg border border-[#00F0B5]/20">
                      Copy &amp; DM the client
                    </span>
                  </div>
                )}
              </div>
            )}

            {typingDone && (
              <div className="mt-5 pt-4 border-t border-white/[0.04]">
                <p className="text-xs text-gray-500 text-center">
                  <span className="text-[#00F0B5] font-semibold">
                    This is what you send.
                  </span>{" "}
                  Find the gig, generate a proposal, copy it, and DM the client,
                  all in under 60 seconds.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

function FeatureCard({ icon: Icon, title, description, badge, accent }) {
  return (
    <div className="rounded-xl p-6 bg-[#0d1425] border border-white/[0.07] hover:border-[#00F0B5]/25 transition-colors duration-200 h-full">
      <div className="flex items-start justify-between mb-5">
        <div
          className={`w-10 h-10 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center`}
        >
          <Icon className="w-5 h-5 text-[#020617]" />
        </div>
        {badge && (
          <span className="text-[11px] font-semibold text-[#00F0B5] tracking-widest uppercase">
            {badge}
          </span>
        )}
      </div>
      <h3 className="text-base font-bold mb-2 text-white">{title}</h3>
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

function FaqItem({ question, answer, visible, index, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div
      className={`glass-card rounded-xl overflow-hidden transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
      style={stagger(index)}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-sm font-semibold text-white">{question}</span>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-60 pb-5" : "max-h-0"}`}
      >
        <p className="text-sm text-gray-400 leading-relaxed px-5">{answer}</p>
      </div>
    </div>
  );
}

function TestimonialCard({
  quote,
  name,
  role,
  amount,
  img,
  initials,
  color,
  rating,
}) {
  return (
    <div className="rounded-xl p-6 relative bg-[#0d1425] border border-white/[0.07] hover:border-white/[0.13] transition-colors duration-200">
      {amount && (
        <div className="mb-3">
          <span className="text-2xl font-extrabold text-[#00F0B5]">
            {amount}
          </span>
          <span className="text-sm text-gray-500 ml-2">deal closed</span>
        </div>
      )}
      {rating && (
        <div className="flex items-center gap-0.5 mb-3">
          {[...Array(rating)].map((_, i) => (
            <Star
              key={i}
              className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400"
            />
          ))}
        </div>
      )}
      <p className="text-gray-300 leading-relaxed mb-5 text-sm">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="flex items-center gap-3">
        {img ? (
          <img
            src={img}
            alt={name}
            className="w-10 h-10 rounded-full object-cover border border-white/10 flex-shrink-0"
          />
        ) : (
          <div
            className={`w-10 h-10 rounded-full bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0`}
          >
            <span className="text-xs font-bold text-[#020617]">{initials}</span>
          </div>
        )}
        <div>
          <p className="font-semibold text-sm text-white">{name}</p>
          <p className="text-xs text-gray-500">{role}</p>
        </div>
      </div>
    </div>
  );
}
