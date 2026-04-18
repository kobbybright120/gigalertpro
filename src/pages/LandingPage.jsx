import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PAYMENTS_ENABLED } from "../../payments.config.js";
import {
  trackScrollDepth,
  trackHeroCtaClick,
  trackSecondaryCtaClick,
  trackSectionViewed,
  trackFaqOpened,
  trackPricingPlanClicked,
  trackLiveDemoStarted,
} from "../lib/umami";
import {
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Shield,
  ShieldCheck,
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
  Users,
  X,
  Mail,
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
    headline: "We're hiring a React developer to build a SaaS dashboard",
    statusLabel: "Hiring",
    source: "Reddit",
    sourceColor: "text-orange-400",
    sub: "r/forhire",
    budget: "$4,000 to $6,000",
    score: 92,
    time: "2 min ago",
    keywords: ["React", "TypeScript", "API"],
    upvotes: 8,
    proposal:
      "I will build your SaaS analytics dashboard in 3 weeks, fully real-time and production-ready.\n\nMy work: https://github.com/devsamples/saas-dashboards\n\nHi,\n\nI see you are looking for a React developer to build an analytics dashboard for your SaaS platform, you are in luck. I have built 3 SaaS dashboards with live Stripe and Segment integrations under my belt, and I will be applying the same approach to yours. The last one cut manual reporting by 80% the week it launched.\n\nHere is what I will do for your project:\n\n\u2022 React with TypeScript so your data models are type-safe end to end\n\u2022 WebSocket-powered charts that update in real time without page refreshes\n\u2022 Role-based access control so each team member sees only what they need\n\nI can deliver a working prototype by end of week one so you see real progress fast.\n\nWhat is your target launch date?",
  },
  {
    id: 2,
    title: "Need a Modern Logo for Fitness App",
    headline: "We're hiring a logo designer for a fitness app",
    statusLabel: "Hiring",
    source: "Threads",
    sourceColor: "text-violet-400",
    sub: "@freelancegigs",
    budget: "$800 to $1,200",
    score: 78,
    time: "5 min ago",
    keywords: ["Logo Design", "Branding"],
    upvotes: 3,
    proposal:
      "I will design 3 logo concepts for your fitness app and revise until you love one.\n\nMy portfolio: https://dribbble.com/kayla_branding\n\nHi,\n\nI see you are looking for a modern logo for your fitness app, you are in luck. I have designed brand identities for 3 health and wellness apps in the last year, including one that went on to be featured in the App Store after launch.\n\nHere is what you will get:\n\n\u2022 3 distinct logo directions, from minimal to bold, so you have real options\n\u2022 App-store-optimized icon version for both iOS and Android\n\u2022 Dark and light variants plus a one-color version for merch and print\n\u2022 Brand guideline PDF with exact spacing rules and hex codes\n\nShould we hop on a quick call to nail the exact vibe you are going for?",
  },
  {
    id: 3,
    title: "Full-Stack Dev for Headless Shopify Rebuild",
    headline:
      "Hiring: full-stack developer to rebuild a headless Shopify store",
    statusLabel: "Hiring",
    source: "Reddit",
    sourceColor: "text-orange-400",
    sub: "r/freelance",
    budget: "$6,000 to $10,000",
    score: 95,
    time: "8 min ago",
    keywords: ["Shopify", "Next.js", "Performance"],
    upvotes: 24,
    proposal:
      "I will rebuild your Shopify store headless and get product pages loading under 1 second.\n\nMy work: https://github.com/tomwrites/headless-shopify\n\nHi,\n\nI see you are looking for a full-stack developer to take your Shopify store headless, you are in luck. I did exactly this for a similar brand last quarter. Lighthouse score went from 34 to 96 and conversions jumped 42% in the first month.\n\nHere is the plan:\n\n\u2022 Full audit of your current Shopify analytics to pinpoint where customers drop off\n\u2022 Next.js storefront with ISR so product pages load in under 1 second\n\u2022 Single-page checkout with Apple Pay and Google Pay already wired in\n\u2022 A/B testing built in from day one so you see the real lift in your numbers\n\nI can have a working prototype ready in 10 days.\n\nWant to look at your current analytics together on a quick call?",
  },
  {
    id: 4,
    title: "Video Editor for YouTube Channel",
    headline: "We're hiring a video editor for a high-growth YouTube channel",
    statusLabel: "Hiring",
    source: "X / Twitter",
    sourceColor: "text-sky-400",
    sub: "@startupgigs",
    budget: "$500 / video",
    score: 71,
    time: "12 min ago",
    keywords: ["Video Editing", "YouTube"],
    upvotes: 5,
    proposal:
      "I will edit your YouTube videos to hit 65% or higher audience retention, consistently.\n\nRecent work: https://youtube.com/@editsbymarcus\n\nHi,\n\nI see you are looking for a video editor for your startup YouTube channel, you are in luck. I have edited over 120 videos for tech and lifestyle creators with an average audience retention of 65%, which puts all of them above the platform average.\n\nHere is what I deliver on every video:\n\n\u2022 Punchy cold opens engineered to hook viewers in the first 8 seconds\n\u2022 Tight jump cuts with dynamic pacing so the energy never drops\n\u2022 Custom thumbnails, lower-thirds, and on-brand motion graphics\n\u2022 First draft back to you within 48 hours, revisions until it is right\n\nWant to send me a raw clip so I can show you exactly what the edit would look like?",
  },
  {
    id: 5,
    title: "WordPress Developer for Agency Site",
    headline: "Hiring: WordPress developer to build an agency website",
    statusLabel: "Hiring",
    source: "Reddit",
    sourceColor: "text-orange-400",
    sub: "r/hiring",
    budget: "$2,000 to $3,500",
    score: 84,
    time: "15 min ago",
    keywords: ["WordPress", "PHP"],
    upvotes: 11,
    proposal:
      "I will build your agency site on WordPress and get it loading under 1.5 seconds on the first visit.\n\nRecent builds: https://portfolio.devbynadia.com\n\nHi,\n\nI see you are looking for a WordPress developer to build your agency site, you are in luck. I have built 15 agency sites on WordPress and the most recent one dropped load time from 4.2 seconds to 1.1 seconds, which pushed contact form submissions up 35% that same month.\n\nHere is exactly what I will build:\n\n\u2022 Custom lightweight theme from scratch, no bloated page builders touching your code\n\u2022 Mobile-first layout so the site looks sharp on every screen size\n\u2022 Full SEO setup with schema markup and Core Web Vitals all in the green\n\u2022 Delivered in 2 weeks with a short CMS training video so your team can make updates\n\nCan we jump on a quick call to look at your current site and talk through the goals?",
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { user } = useAuth();

  async function handleCheckout(tier) {
    if (!PAYMENTS_ENABLED || !user) {
      // Payments disabled or not logged in: send to auth first
      window.location.href = `/auth?next=checkout&tier=${encodeURIComponent(tier)}`;
      return;
    }

    try {
      const res = await fetch("/api/create-dodo-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          email: user?.email ?? undefined,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout error:", data.error);
        // Fallback to auth page if Dodo Payments not yet configured
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

  /* ── Scroll depth tracking ── */
  useEffect(() => {
    const THRESHOLDS = [25, 50, 75, 90, 100];
    const fired = new Set();
    function onScroll() {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const pct = Math.round((scrolled / total) * 100);
      THRESHOLDS.forEach((t) => {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          trackScrollDepth(t);
        }
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Section visibility tracking ── */
  useEffect(() => {
    if (featVis) trackSectionViewed("features");
  }, [featVis]);
  useEffect(() => {
    if (howVis) trackSectionViewed("how_it_works");
  }, [howVis]);
  useEffect(() => {
    if (demoVis) trackSectionViewed("live_demo");
  }, [demoVis]);
  useEffect(() => {
    if (priceVis) trackSectionViewed("pricing");
  }, [priceVis]);
  useEffect(() => {
    if (proofVis) trackSectionViewed("social_proof");
  }, [proofVis]);
  useEffect(() => {
    if (faqVis) trackSectionViewed("faq");
  }, [faqVis]);
  useEffect(() => {
    if (ctaVis) trackSectionViewed("final_cta");
  }, [ctaVis]);

  const location = useLocation();

  useEffect(() => {
    try {
      if (location?.hash === "#pricing" || location?.state?.openPricing) {
        const el = document.getElementById("pricing");
        if (el) {
          // small timeout to allow any layout/rendering to complete
          setTimeout(
            () => el.scrollIntoView({ behavior: "smooth", block: "start" }),
            50,
          );
        }
      }
    } catch (e) {
      // ignore
    }
  }, [location]);

  return (
    <div className="min-h-screen bg-[#020617] text-white font-sans overflow-x-hidden">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-[#020617]/70 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-xl font-bold tracking-tight"
          >
            <img
              src="/logo/icon.svg?v=20260409"
              alt="GigAlertPro"
              className="w-8 h-8 rounded-lg object-cover"
            />
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
              onClick={() => trackHeroCtaClick("navbar")}
              className="inline-flex items-center gap-1 px-3 py-2 sm:px-5 sm:py-2.5 bg-[#00F0B5] text-[#020617] text-xs sm:text-sm font-semibold rounded-lg hover:bg-[#00dba5] transition-all duration-200"
            >
              <span className="hidden sm:inline">Find My Clients</span>
              <span className="sm:hidden">Find Clients</span>
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section ref={heroRef} className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-5%,rgba(0,240,181,0.06)_0%,transparent_100%)]" />

        <div
          className={`relative max-w-4xl mx-auto px-4 pt-16 pb-14 sm:pt-28 sm:pb-24 text-center transition-all duration-1000 ease-out ${heroVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
        >
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 glass-card rounded-full mb-10 border border-[#00F0B5]/15">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]" />
            </span>
            <span className="text-sm text-[#00F0B5] font-medium tracking-wide">
              Finding clients on Reddit, X, Threads, Facebook, LinkedIn & Craigslist right
              now
            </span>
          </div>

          <h1 className="text-[2.25rem] sm:text-5xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight">
            Your next client is looking for you.{" "}
            <br className="hidden sm:block" />
            <span className="text-gradient">GigAlertPro finds them.</span>
          </h1>

          <p className="mt-7 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Clients post what they need every day on Reddit, X, Threads, LinkedIn and
            Craigslist. GigAlertPro finds them automatically and writes your
            proposal.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-10 sm:mt-12 w-full">
            <Link
              to="/auth"
              onClick={() => trackHeroCtaClick("hero_primary")}
              className="group inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 bg-[#00F0B5] text-[#020617] font-bold rounded-lg hover:bg-[#00dba5] transition-all duration-200 text-base"
            >
              Find My Clients
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#demo"
              onClick={() => trackSecondaryCtaClick("see_how_it_finds")}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 border border-white/10 text-gray-300 font-semibold rounded-full hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300 text-base"
            >
              See how it finds clients
            </a>
          </div>

          <p className="mt-5 text-sm text-gray-500">
            🛡️ 3-Day Money Back Guarantee. Cancel anytime.
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
                freelancers already finding clients on Reddit, X, Threads & more
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 mt-8 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#00F0B5]/60" /> Secure checkout
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
            Right now a client is posting on Reddit, X, Threads, LinkedIn or Craigslist
            looking for someone with your exact skills.{" "}
            <span className="text-white font-semibold">
              Without GigAlertPro you will never know they existed.
            </span>
          </p>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section
        ref={statsRef}
        className="relative border-b border-white/[0.04] bg-[#0B1120]/40"
      >
        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {[
            { value: "50+", label: "Sources Scanned" },
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
      <section ref={featRef} id="features" className="relative py-16 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-center mb-10 sm:mb-16 transition-all duration-700 ease-out ${featVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              <span className="text-[#00F0B5]">
                Everything you need to find clients who are already looking.
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Radio,
                title: "Real-Time Gig Radar",
                description:
                  "The moment a client posts looking for your skills it appears in your dashboard instantly.",
                accent: "from-[#00F0B5] to-[#00D4FF]",
              },
              {
                icon: Globe,
                title: "Multi-Platform Coverage",
                description:
                  "Reddit, X, Threads, Facebook, LinkedIn and Craigslist monitored simultaneously. Every match in one dashboard.",
                accent: "from-orange-400 to-orange-500",
              },
              {
                icon: TrendingUp,
                title: "Gig Quality Scoring",
                description:
                  "Every post scored 0-100 by budget and client seriousness. Focus only on the best ones.",
                accent: "from-[#f59e0b] to-[#fbbf24]",
              },
              {
                icon: Bell,
                title: "Instant Alerts",
                description:
                  "Instant browser alert the moment a client posts looking for your skills. Never miss one again.",
                accent: "from-blue-400 to-blue-500",
              },
              {
                icon: Sparkles,
                title: "AI Proposal Generator",
                badge: "AI",
                description:
                  "Our AI reads the client's post and writes a personalized proposal tailored to their exact problem.",
                accent: "from-[#7c3aed] to-[#a78bfa]",
              },
              {
                icon: Trophy,
                title: "Win Rate Learning",
                description:
                  "The AI studies what wins for you and gets better every time you use it.",
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
        className="relative py-16 sm:py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-center mb-10 sm:mb-16 transition-all duration-700 ease-out ${howVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Three steps to{" "}
              <span className="text-[#00F0B5]">
                finding clients already looking for you.
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                emoji: "\ud83c\udfaf",
                title: "Tell Us Your Skills",
                desc: "Enter your skills. GigAlertPro immediately starts scanning Reddit, X, Threads, LinkedIn and Craigslist for matching clients.",
              },
              {
                step: "02",
                emoji: "\u26a1",
                title: "We Find The Clients For You",
                desc: "The moment a client posts looking for your skills you get an instant alert. No searching needed.",
              },
              {
                step: "03",
                emoji: "\u2728",
                title: "Reach Out With The Perfect Message",
                desc: "Our AI reads their post and writes a personalized proposal. Review it and send.",
              },
            ].map(({ step, emoji, title, desc }, i) => (
              <div
                key={step}
                className={`relative group transition-all duration-700 ease-out ${howVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={stagger(i)}
              >
                <div className="glass-card rounded-2xl p-5 sm:p-8 hover:border-[#00F0B5]/15 transition-all duration-300 h-full">
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
        className="relative py-16 sm:py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-center mb-10 sm:mb-16 transition-all duration-700 ease-out ${demoVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              Live Demo
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              See how GigAlertPro finds clients for you in real time
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              Enter your skills and watch as GigAlertPro finds real clients
              posting what they need across Reddit, X, Threads, LinkedIn and Craigslist
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
      <PricingSection
        priceRef={priceRef}
        priceVis={priceVis}
        handleCheckout={handleCheckout}
      />

      {/* ── Social Proof ── */}
      <section
        ref={proofRef}
        className="relative py-16 sm:py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <div
              className={`transition-all duration-700 ease-out ${proofVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-4">
                Real Results
              </p>
              <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">
                Freelancers are finding clients{" "}
                <span className="text-[#00F0B5]">they never knew existed</span>{" "}
                and closing $5K+ deals.
              </h2>

              <div className="mt-10 space-y-5">
                <BenefitItem text="Find clients already looking for your skills" />
                <BenefitItem text="One dashboard covers Reddit, X, Threads, LinkedIn & Craigslist" />
                <BenefitItem text="Skip low quality posts with quality scoring" />
                <BenefitItem text="AI proposals written for each specific client" />
                <BenefitItem text="Stop wasting hours searching manually" />
              </div>

              <Link
                to="/auth"
                onClick={() => trackHeroCtaClick("real_results")}
                className="group inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 mt-8 sm:mt-12 bg-[#00F0B5] text-[#020617] font-bold rounded-lg hover:bg-[#00dba5] transition-all duration-200 text-base"
              >
                Find My Clients
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div
              className={`space-y-5 transition-all duration-700 ease-out delay-200 ${proofVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                Real freelancers finding real clients they never would have
                discovered.
              </h3>
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
                quote="I was spending 2 hours a day refreshing Reddit and Threads. Now I just wait for the ping. Landed $8,000 in new work my first month. Honestly can’t believe I used to do this manually."
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
        className="relative py-16 sm:py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-center mb-10 sm:mb-16 transition-all duration-700 ease-out ${faqVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
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
                q: "How does GigAlertPro find clients for me?",
                a: "GigAlertPro scans Reddit, X, Threads, Facebook, LinkedIn and Craigslist continuously 24/7. The moment a client posts looking for a freelancer matching your skills it appears in your dashboard and you get an instant alert. Clients post what they need every day on these platforms. Most freelancers just never know where to look. GigAlertPro does the finding for you automatically.",
                defaultOpen: true,
              },
              {
                q: "How is this different from Upwork or Fiverr?",
                a: "Upwork and Fiverr are marketplaces where you compete with hundreds of freelancers for the same posted jobs. GigAlertPro finds clients who post what they need organically on Reddit, X, Threads, Facebook, LinkedIn and Craigslist. Places most freelancers never look. Those clients are not overwhelmed with proposals. They posted because they need help and they are waiting for the right person to reach out.",
                defaultOpen: true,
              },
              {
                q: "What platforms does GigAlertPro find clients on?",
                a: "GigAlertPro scans Reddit including 34+ subreddits like r/forhire and r/freelance, X/Twitter, Threads, Facebook, LinkedIn and Craigslist. We are constantly adding new sources to make sure no client post goes unnoticed. All matching posts appear in one dashboard so you never have to manually check multiple platforms again.",
              },
              {
                q: "What does the AI proposal writer do?",
                a: "Once GigAlertPro finds a client post matching your skills our AI reads the post and understands exactly what that specific client needs. It then writes you a personalized proposal in a human tone tailored to their exact problem. It does not send a generic template. It writes a real message that sounds like you sat down and wrote it yourself specifically for that client.",
              },
              {
                q: "Can I cancel anytime?",
                a: "Yes. No contracts. No cancellation fees. Cancel directly from your dashboard in one click. Cancel anytime. No hidden fees.",
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
      <section ref={ctaRef} className="relative py-14 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div
            className={`glass-card rounded-2xl sm:rounded-3xl p-7 sm:p-12 lg:p-16 relative overflow-hidden transition-all duration-700 ease-out ${ctaVis ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#00F0B5]/[0.06] to-[#00D4FF]/[0.03]" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                Your next client is posting right now. Will you find them?
              </h2>
              <p className="text-gray-400 text-lg max-w-lg mx-auto mb-8">
                Without GigAlertPro those posts disappear and you never know
                they existed.
              </p>
              <Link
                to="/auth"
                onClick={() => trackHeroCtaClick("final_cta")}
                className="group inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 bg-[#00F0B5] text-[#020617] font-bold rounded-lg hover:bg-[#00dba5] transition-all duration-200 text-base"
              >
                Find My Clients
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <p className="text-sm text-gray-500 mt-5">
                Join 2,400+ freelancers already finding clients with GigAlertPro
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
                <img
                  src="/logo/icon.svg?v=20260409"
                  alt="GigAlertPro"
                  className="w-7 h-7 rounded-md object-cover"
                />
                <span>
                  GigAlert<span className="text-gradient">Pro</span>
                </span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                We find the clients. You close the deals.
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
                  to="/privacy"
                  className="block hover:text-gray-300 transition-colors"
                >
                  Privacy Policy
                </Link>
                <Link
                  to="/terms"
                  className="block hover:text-gray-300 transition-colors"
                >
                  Terms of Service
                </Link>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-300 mb-3">
                Contact
              </p>
              <div className="flex flex-col gap-3 text-sm text-gray-500">
                <a
                  href="https://mail.google.com/mail/?view=cm&fs=1&to=support@gigalertpro.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-[#00F0B5] transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  support@gigalertpro.com
                </a>
                <a
                  href="https://www.linkedin.com/in/kobby-bright-35699a2a6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-[#00F0B5] transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                  LinkedIn
                </a>
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
    trackLiveDemoStarted();
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
        <div className="lg:col-span-5 glass-card rounded-2xl p-5 flex flex-col min-h-[260px] sm:min-h-[380px]">
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
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {gig.statusLabel && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-semibold uppercase tracking-wide">
                            {gig.statusLabel}
                          </span>
                        )}
                        <h4 className="text-sm font-semibold text-white leading-snug line-clamp-2">
                          {gig.headline || gig.title}
                        </h4>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">
                        {gig.title}
                      </p>
                    </div>
                    <span
                      className={`text-lg font-extrabold shrink-0 ${gig.score >= 85 ? "text-[#00F0B5]" : gig.score >= 70 ? "text-yellow-400" : "text-gray-500"}`}
                    >
                      {gig.score}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-[11px]">
                    <span className={`font-semibold ${gig.sourceColor}`}>
                      {gig.source}
                    </span>
                    <span className="text-gray-600">&middot;</span>
                    <span className="text-gray-500">{gig.sub}</span>
                    <span className="text-gray-600">&middot;</span>
                    <span className="text-gray-500">{gig.time}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Panel 3: Gig Details + Generate Proposal */}
        <div className="lg:col-span-4 glass-card rounded-2xl p-5 flex flex-col min-h-[260px] sm:min-h-[380px]">
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
                <div className="flex items-center gap-2 mb-1">
                  {active.statusLabel && (
                    <span className="inline-block text-[11px] mr-2 px-2 py-0.5 bg-emerald-500/10 text-emerald-300 rounded-full font-semibold uppercase tracking-wide">
                      {active.statusLabel}
                    </span>
                  )}
                  <h4 className="text-sm font-bold text-white leading-snug">
                    {active.headline || active.title}
                  </h4>
                </div>
                {active.title && active.headline && (
                  <p className="text-xs text-gray-500 mb-1">{active.title}</p>
                )}
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
   PRICING SECTION
   ═══════════════════════════════════════════════════════════════════════ */
function PricingSection({ priceRef, priceVis, handleCheckout }) {
  const [billingPeriod, setBillingPeriod] = useState("monthly");
  const isAnnual = billingPeriod === "annual";

  const DODO_LINKS = {
    basic: import.meta.env.NEXT_PUBLIC_DODO_LINK_BASIC || "",
    basic_annual: import.meta.env.NEXT_PUBLIC_DODO_LINK_BASIC_ANNUAL || "",
    pro: import.meta.env.NEXT_PUBLIC_DODO_LINK_PRO || "",
    pro_annual: import.meta.env.NEXT_PUBLIC_DODO_LINK_PRO_ANNUAL || "",
  };

  const plans = isAnnual
    ? [
        {
          name: "Basic",
          tagline: "Perfect for getting started",
          price: 122,
          priceSuffix: "/year",
          crossedOut: "$144/year",
          saveBadge: "Save $22 — 15% off",
          tier: "basic_annual",
          popular: false,
          features: [
            { text: "25 daily alerts" },
            { text: "Reddit, X, Threads, LinkedIn & Craigslist" },
            { text: "5 keyword trackers" },
            { text: "Gig quality scoring" },
            { text: "10 AI proposals per day" },
            { text: "Browser and email notifications" },
            { text: "Profile builder" },
          ],
          ctaLabel: "Get Started",
          ctaLink: DODO_LINKS.basic_annual,
          ctaClass:
            "w-full py-3.5 border border-white/10 text-gray-300 font-semibold rounded-xl hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300 flex items-center justify-center gap-2 text-sm",
        },
        {
          name: "Pro",
          tagline: "For serious freelancers",
          price: 296,
          priceSuffix: "/year",
          crossedOut: "$348/year",
          saveBadge: "Save $52 — 15% off",
          tier: "pro_annual",
          popular: true,
          features: [
            { text: "Everything in Basic" },
            { text: "100 daily alerts" },
            { text: "20 keyword trackers" },
            { text: "Unlimited AI proposals" },
            { text: "AI learns from winning proposals" },
            { text: "Priority scanning every 10 minutes" },
            { text: "Won/Reply/No Response analytics" },
          ],
          ctaLabel: "Get Started",
          ctaLink: DODO_LINKS.pro_annual,
          ctaClass:
            "w-full py-3.5 bg-[#00F0B5] text-[#020617] font-bold rounded-xl hover:bg-[#00dba5] transition-all duration-200 flex items-center justify-center gap-2 text-sm",
        },
      ]
    : [
        {
          name: "Basic",
          tagline: "Perfect for getting started",
          price: 12,
          priceSuffix: "/month",
          tier: "basic",
          popular: false,
          features: [
            { text: "25 daily alerts" },
            { text: "Reddit, X, Threads, LinkedIn & Craigslist" },
            { text: "5 keyword trackers" },
            { text: "Gig quality scoring" },
            { text: "10 AI proposals per day" },
            { text: "Browser and email notifications" },
            { text: "Profile builder" },
          ],
          ctaLabel: "Get Started",
          ctaLink: DODO_LINKS.basic,
          ctaClass:
            "w-full py-3.5 border border-white/10 text-gray-300 font-semibold rounded-xl hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300 flex items-center justify-center gap-2 text-sm",
        },
        {
          name: "Pro",
          tagline: "For serious freelancers",
          price: 29,
          priceSuffix: "/month",
          tier: "pro",
          popular: true,
          features: [
            { text: "Everything in Basic" },
            { text: "100 daily alerts" },
            { text: "20 keyword trackers" },
            { text: "Unlimited AI proposals" },
            { text: "AI learns from winning proposals" },
            { text: "Priority scanning every 10 minutes" },
            { text: "Won/Reply/No Response analytics" },
          ],
          ctaLabel: "Get Started",
          ctaLink: DODO_LINKS.pro,
          ctaClass:
            "w-full py-3.5 bg-[#00F0B5] text-[#020617] font-bold rounded-xl hover:bg-[#00dba5] transition-all duration-200 flex items-center justify-center gap-2 text-sm",
        },
      ];

  return (
    <section
      ref={priceRef}
      id="pricing"
      className="relative py-16 sm:py-28 border-t border-white/[0.04]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`text-center mb-10 sm:mb-16 transition-all duration-700 ease-out ${priceVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Simple, transparent pricing.
          </h2>
          <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
            Pick the plan that fits your workload. Cancel anytime.
          </p>

          {/* Monthly / Annual toggle */}
          <div className="mt-6 inline-flex items-center bg-white/5 border border-white/10 rounded-full p-1">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${
                !isAnnual
                  ? "bg-[#00F0B5] text-[#020617]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("annual")}
              className={`px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${
                isAnnual
                  ? "bg-[#00F0B5] text-[#020617]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Annual <span className="text-xs opacity-80">Save 15%</span>
            </button>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {plans.map((plan, i) => (
            <div
              key={plan.tier}
              className={`relative flex flex-col rounded-2xl p-5 sm:p-8 transition-all duration-700 ease-out glass-card ${
                plan.popular
                  ? "border-[#00F0B5]/20 hover:border-[#00F0B5]/30 glow-green"
                  : "hover:border-white/10"
              } ${priceVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={stagger(i)}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#00F0B5] text-[#020617] text-xs font-bold rounded-full">
                    <Star className="w-3 h-3" /> Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <p className="text-gray-500 text-sm mt-1">{plan.tagline}</p>
              </div>

              <div className="mb-8">
                {plan.crossedOut && (
                  <p className="text-gray-500 text-sm line-through mb-1">
                    {plan.crossedOut}
                  </p>
                )}
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-extrabold text-white">
                    ${plan.price}
                  </span>
                  <span className="text-gray-500 text-sm pb-2">
                    {plan.priceSuffix}
                  </span>
                </div>
                {plan.saveBadge && (
                  <span className="inline-block mt-2 px-2.5 py-1 bg-[#00F0B5]/10 text-[#00F0B5] text-xs font-bold rounded-full border border-[#00F0B5]/20">
                    {plan.saveBadge}
                  </span>
                )}
                {!plan.saveBadge && (
                  <p className="text-sm text-[#00F0B5] mt-1.5 font-medium">
                    Billed monthly
                  </p>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <PricingFeature
                    key={f.text}
                    text={f.text}
                    highlighted={plan.popular}
                  />
                ))}
              </ul>

              {plan.ctaLink ? (
                <a
                  href={plan.ctaLink}
                  onClick={() => trackPricingPlanClicked(plan.tier)}
                  className={plan.ctaClass}
                >
                  {plan.ctaLabel}
                  <ArrowRight className="w-4 h-4" />
                </a>
              ) : (
                <button
                  onClick={() => {
                    trackPricingPlanClicked(plan.tier);
                    handleCheckout(plan.tier);
                  }}
                  className={plan.ctaClass}
                >
                  {plan.ctaLabel}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Money Back Guarantee Badge */}
        <div className="flex items-center justify-center gap-3 mt-8 px-5 py-4 bg-[#00F0B5]/[0.06] border border-[#00F0B5]/15 rounded-2xl max-w-2xl mx-auto">
          <ShieldCheck className="w-6 h-6 text-[#00F0B5] shrink-0" />
          <p className="text-sm text-gray-300 text-left">
            <span className="text-[#00F0B5] font-bold">
              3-Day Money Back Guarantee
            </span>{" "}
            If GigAlertPro doesn't find you relevant gigs in 3 days, we'll
            refund you completely. No questions asked.
          </p>
        </div>

        {/* Trust strip */}
        <div
          className={`mt-10 sm:mt-16 glass-card rounded-2xl p-5 sm:p-8 max-w-4xl mx-auto transition-all duration-700 ease-out ${priceVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          style={stagger(4)}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-8 text-center">
            {[
              { value: "50+", label: "Sources Scanned" },
              { value: "$2.4M+", label: "In Gigs Discovered" },
              { value: "4.9/5", label: "Average Rating" },
              { value: "4.9/5", label: "User Rating" },
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

        <p className="text-center text-sm text-gray-500 mt-8">
          Questions?{" "}
          <a
            href="https://mail.google.com/mail/?view=cm&fs=1&to=support@gigalertpro.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[#00F0B5] hover:underline"
          >
            <Mail className="w-3.5 h-3.5" />
            Contact us
          </a>
          . We reply within 24 hours.
        </p>
      </div>
    </section>
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

  function handleToggle() {
    const opening = !open;
    setOpen(opening);
    if (opening) trackFaqOpened(question);
  }

  return (
    <div
      className={`glass-card rounded-xl overflow-hidden transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
      style={stagger(index)}
    >
      <button
        onClick={handleToggle}
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
