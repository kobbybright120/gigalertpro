import { useState, useEffect } from "react";
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
  FileText,
  AlertTriangle,
  Loader2,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   LIVE DEMO DATA — simulates the proposal generation flow
   ═══════════════════════════════════════════════════════════════════════ */
const DEMO_JOBS = [
  {
    tab: "React Developer",
    title: "React Developer for SaaS Dashboard",
    body: "Looking for a React developer to build an analytics dashboard for our B2B SaaS product. Must include real-time charts, user management, and API integrations with Stripe and Segment.\n\nBudget: $4,000–$6,000",
    quality: 82,
    qualityLabel: "Strong project with clear scope and verified payment",
    signals: [
      { text: "Verified payment method", good: true },
      { text: "Clear technical requirements", good: true },
      { text: "Budget aligns with scope", good: true },
    ],
    skillMatch: 91,
    skills: ["React", "TypeScript", "API Integration", "Charts"],
    proposal:
      "You need an analytics dashboard that doesn't just display data but actually helps your team make decisions quickly. I've built three SaaS dashboards with real-time Stripe and Segment integrations, and the last one reduced the client's manual reporting time by 80%.\n\nFrom your description, the core challenge is pulling live data from multiple APIs into something that feels fast and responsive. Here's how I'd approach it:\n\n\u2022 Build the dashboard shell in React with TypeScript for type safety across your Stripe and Segment data models\n\u2022 Set up WebSocket connections for real-time chart updates so your team sees live metrics without refreshing\n\u2022 Create a role-based user management system with granular permissions for different team sizes\n\u2022 Deliver a fully responsive build in 3 weeks with a recorded walkthrough of every feature\n\nI recently built something very similar for a fintech startup. Their dashboard handles 50K+ events per day and their team switched from spreadsheets to using it exclusively within a week.\n\nWhat's your timeline looking like for getting this in front of your team?",
  },
  {
    tab: "Logo Designer",
    title: "Modern Logo for Fitness App Startup",
    body: "We're launching a fitness tracking app called FitPulse and need a modern, energetic logo. Think bold colors, clean lines, maybe incorporating a heartbeat or pulse motif.\n\nNeed: Primary logo, icon version, dark/light variants.\nBudget: $800\u2013$1,200",
    quality: 74,
    qualityLabel: "Good creative brief but explore brand direction in call",
    signals: [
      { text: "Clear deliverables listed", good: true },
      { text: "Open to creative direction", good: true },
      { text: "Startup \u2014 may iterate heavily", good: false },
    ],
    skillMatch: 85,
    skills: ["Logo Design", "Brand Identity", "Illustrator"],
    proposal:
      "A heartbeat motif can go one of two ways for a fitness brand: either it feels generic and forgettable, or it becomes the visual hook that people instantly associate with FitPulse. The difference is in how you abstract it.\n\nI've designed logos for three health and wellness apps, and the one that performed best ditched the literal heartbeat for a dynamic pulse wave built into the lettermark itself. It read as \"energy\" without being obvious.\n\nHere's what I'd deliver:\n\n\u2022 3 distinct logo concepts ranging from minimal to bold, each with the pulse motif interpreted differently\n\u2022 An icon version optimized for app stores at every required size\n\u2022 Dark and light variants plus a one-color version for merchandise\n\u2022 Full brand guideline PDF with spacing, color codes, and usage rules\n\nThe last fitness brand I designed for told me their logo got compliments from investors during their seed round pitch.\n\nWant to start with a quick 15-minute call so I can nail the vibe you're going for?",
  },
  {
    tab: "Full-Stack Dev",
    title: "Full-Stack Developer for E-commerce Rebuild",
    body: "Our Shopify store is slow and the checkout flow is losing customers. Need someone to rebuild it with a headless approach \u2014 Next.js frontend, Shopify backend. Must improve page speed and conversion rate.\n\nBudget: $6,000\u2013$10,000",
    quality: 88,
    qualityLabel:
      "Excellent project \u2014 clear problem, strong budget, measurable goals",
    signals: [
      { text: "Verified payment method", good: true },
      { text: "Measurable success criteria", good: true },
      { text: "Budget matches headless rebuild scope", good: true },
    ],
    skillMatch: 94,
    skills: ["Next.js", "Shopify", "Headless CMS", "Performance"],
    proposal:
      'Your checkout flow is probably losing more customers than you think. I suspect the issue isn\'t just speed \u2014 it\'s likely the number of steps between "Add to Cart" and "Pay" combined with slow server-rendered pages that make users feel like the site is broken.\n\nI rebuilt a similar Shopify store headless with Next.js last quarter. Their Lighthouse score went from 34 to 96, and checkout conversions jumped 42% in the first month.\n\nHere\'s my approach for your rebuild:\n\n\u2022 Audit your current Shopify analytics to find the exact drop-off points in the funnel\n\u2022 Build the storefront in Next.js with ISR so product pages load in under 1 second\n\u2022 Redesign the checkout to a single-page flow with Apple Pay and Google Pay for one-tap purchasing\n\u2022 Set up A/B testing on the new checkout so you can measure the conversion lift with real data\n\nI can have a working prototype in front of you within 10 days.\n\nShould we start with a quick call to look at your current analytics together?',
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
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
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDI0MCwxODEsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-60" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#00F0B5]/[0.04] rounded-full blur-[100px]" />
        <div className="absolute top-40 -left-40 w-[400px] h-[400px] bg-[#00D4FF]/[0.03] rounded-full blur-[80px]" />
        <div className="absolute top-20 -right-40 w-[400px] h-[400px] bg-[#7c3aed]/[0.03] rounded-full blur-[80px]" />

        <div className="relative max-w-4xl mx-auto px-4 pt-28 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 glass-card rounded-full mb-10 border border-[#00F0B5]/15">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]" />
            </span>
            <span className="text-sm text-[#00F0B5] font-medium tracking-wide">
              AI-powered gig hunting + proposal generation
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight">
            Win more <br className="hidden sm:block" />
            <span className="text-gradient">freelance projects</span>
          </h1>

          <p className="mt-7 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            We scan 37+ sources every 2 minutes, find the best gigs for your
            skills, then generate personalized winning proposals in seconds
            &mdash; built from your real experience.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12">
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-[#00F0B5] text-[#020617] font-bold rounded-full hover:bg-[#00dba5] hover:shadow-[0_0_32px_rgba(0,240,181,0.3)] transition-all duration-300 text-base"
            >
              Start Free
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
              <Sparkles className="w-4 h-4 text-[#00F0B5]/60" /> 5 free
              proposals included
            </span>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="relative border-y border-white/[0.04] bg-[#0B1120]/40">
        <div className="max-w-5xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "10,000+", label: "Proposals Generated" },
            { value: "85%", label: "Win Rate Increase" },
            { value: "12s", label: "Avg Generation Time" },
            { value: "4.9", label: "User Rating" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-3xl sm:text-4xl font-extrabold text-gradient">
                {value}
              </p>
              <p className="text-sm text-gray-500 mt-1.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Everything you need to{" "}
              <span className="text-gradient">win more projects</span>
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              From intelligent gig scanning to personalized proposals, we built
              the complete toolkit for freelance success.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={Search}
              title="Smart Gig Radar"
              description="Set keywords and we scan 37+ sources across Reddit, Craigslist & X/Twitter every 2 minutes. Get matched with the best gigs before anyone else sees them."
              accent="from-[#00F0B5] to-[#00D4FF]"
            />
            <FeatureCard
              icon={Sparkles}
              title="AI Proposal Generator"
              badge="AI-Powered"
              description="Generate personalized, winning proposals in seconds. Built from your real profile, skills, and past wins &mdash; not generic templates."
              accent="from-[#7c3aed] to-[#a78bfa]"
            />
            <FeatureCard
              icon={TrendingUp}
              title="Gig Quality Scoring"
              description="Every gig is scored 0&ndash;100 based on relevance, recency, budget, and competition level. Focus your energy on the gigs most likely to convert."
              accent="from-[#f59e0b] to-[#fbbf24]"
            />
            <FeatureCard
              icon={Trophy}
              title="Win Rate Learning"
              description="Mark proposals as Won, Got Reply, or No Response. The AI studies your winning style and writes future proposals in your voice."
              accent="from-emerald-400 to-emerald-500"
            />
            <FeatureCard
              icon={Bell}
              title="Instant Notifications"
              description="Get browser push notifications the moment a matching gig appears. Be the first to apply &mdash; early applicants get 3x more responses."
              accent="from-blue-400 to-blue-500"
            />
            <FeatureCard
              icon={UserCircle}
              title="Freelancer Profile Hub"
              description="Build your profile with skills, bio, testimonials, and portfolio links. The AI uses all of it to craft proposals that sound like you, not a bot."
              accent="from-pink-400 to-rose-400"
            />
            <FeatureCard
              icon={Bookmark}
              title="Save & Organize Gigs"
              description="Bookmark interesting gigs, save generated proposals, and track your application pipeline from a single dashboard."
              accent="from-cyan-400 to-cyan-500"
            />
            <FeatureCard
              icon={Globe}
              title="Multi-Platform Coverage"
              description="Reddit (34+ subs), Craigslist (10 cities), X/Twitter &mdash; all scanned automatically. One dashboard for every freelance opportunity."
              accent="from-orange-400 to-orange-500"
            />
            <FeatureCard
              icon={MessageSquare}
              title="Tone & Style Control"
              description="Choose Professional, Conversational, or Bold tone for every proposal. The AI adapts its style while keeping your authentic voice."
              accent="from-indigo-400 to-indigo-500"
            />
          </div>
        </div>
      </section>

      {/* ── How it Works ── */}
      <section
        id="how-it-works"
        className="relative py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Three steps to your{" "}
              <span className="text-gradient">winning proposal</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                emoji: "\ud83c\udfaf",
                title: "Set Your Keywords",
                desc: 'Enter skills or roles you want \u2014 "React developer", "logo design", "video editor". Our radar starts scanning 37+ sources immediately.',
              },
              {
                step: "02",
                emoji: "\u26a1",
                title: "Get Matched Instantly",
                desc: "We surface the most relevant gigs scored by quality, budget, and keyword match. You get notified the moment something matches.",
              },
              {
                step: "03",
                emoji: "\u2728",
                title: "Generate & Apply",
                desc: "Click one button to get a tailored AI proposal built from your profile. Edit it, copy, and apply before anyone else.",
              },
            ].map(({ step, emoji, title, desc }) => (
              <div key={step} className="relative group">
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
        id="demo"
        className="relative py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              Live Demo
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              See it in action
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              Watch how gig descriptions transform into personalized, winning
              proposals in seconds.
            </p>
          </div>
          <LiveDemo />
        </div>
      </section>

      {/* ── Pricing ── */}
      <section
        id="pricing"
        className="relative py-28 border-t border-white/[0.04]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
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
            <div className="glass-card rounded-2xl p-8 hover:border-white/10 transition-all duration-300 flex flex-col">
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
                <PricingFeature text="5 AI proposals per day" />
                <PricingFeature text="Basic gig scoring" />
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
            <div className="relative glass-card rounded-2xl p-8 border-[#00F0B5]/20 hover:border-[#00F0B5]/30 transition-all duration-300 flex flex-col glow-green">
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
                <PricingFeature text="50 AI proposals per day" highlighted />
                <PricingFeature
                  text="Win rate learning (few-shot AI)"
                  highlighted
                />
                <PricingFeature
                  text="Competition signal analysis"
                  highlighted
                />
                <PricingFeature
                  text="Priority scanning (every 1 min)"
                  highlighted
                />
                <PricingFeature text="Email + push notifications" highlighted />
                <PricingFeature
                  text="Proposal history & outcomes"
                  highlighted
                />
              </ul>
              <Link
                to="/auth"
                className="block w-full text-center px-6 py-3.5 bg-[#00F0B5] text-[#020617] font-bold rounded-xl hover:bg-[#00dba5] hover:shadow-[0_0_16px_rgba(0,240,181,0.2)] transition-all duration-300"
              >
                Upgrade to Pro
              </Link>
            </div>

            {/* Elite */}
            <div className="glass-card rounded-2xl p-8 hover:border-white/10 transition-all duration-300 flex flex-col">
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
      <section className="relative py-28 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-4">
                Why Freelancers Love Us
              </p>
              <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">
                Freelancers are landing{" "}
                <span className="text-gradient">$5k+ projects</span> by
                responding first.
              </h2>

              <div className="mt-10 space-y-5">
                <BenefitItem text="Be the first to apply to high-paying gigs" />
                <BenefitItem text="Save 10+ hours a week on prospecting" />
                <BenefitItem text="Increase your win rate with AI pitches that learn your style" />
                <BenefitItem text="Cover Reddit, Craigslist & X/Twitter from one dashboard" />
                <BenefitItem text="Track which proposals win and let the AI improve over time" />
              </div>

              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 px-8 py-4 mt-12 bg-[#00F0B5] text-[#020617] font-bold rounded-full hover:bg-[#00dba5] hover:shadow-[0_0_32px_rgba(0,240,181,0.3)] transition-all duration-300 text-base"
              >
                Start Free Today
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div className="space-y-5">
              <TestimonialCard
                quote="GigAlertPro found a Reddit post looking for a designer 3 minutes after it went live. The AI generated a proposal, I tweaked two sentences, and closed a $3,000 project."
                name="Sarah J."
                role="UI Designer"
                initials="SJ"
                color="from-yellow-400 to-orange-400"
              />
              <TestimonialCard
                quote="The AI proposals don't sound like AI at all. After I marked 5 as 'Won', it started writing in my exact style. My response rate went from 10% to over 40%."
                name="Marcus T."
                role="React Developer"
                initials="MT"
                color="from-[#00F0B5] to-[#00D4FF]"
              />
              <TestimonialCard
                quote="The keyword scoring is really smart. I only see the gigs that actually matter. Applied to a $6K Shopify rebuild 8 minutes after it was posted and got hired."
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
      <section className="relative py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="glass-card rounded-3xl p-12 sm:p-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00F0B5]/[0.06] to-[#00D4FF]/[0.03]" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                Ready to win more projects?
              </h2>
              <p className="text-gray-400 text-lg max-w-lg mx-auto mb-8">
                Join thousands of freelancers who write better proposals and
                land more clients with personalized, profile-based pitches.
              </p>
              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 px-8 py-4 bg-[#00F0B5] text-[#020617] font-bold rounded-full hover:bg-[#00dba5] hover:shadow-[0_0_32px_rgba(0,240,181,0.3)] transition-all duration-300 text-base"
              >
                Start Free Today
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <p className="text-xs text-gray-500 mt-4">
                No credit card required. 5 free proposals included.
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
                Win more freelance projects with AI-powered gig scanning and
                personalized proposals built from your real experience.
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
          <div className="pt-8 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              &copy; {new Date().getFullYear()} GigAlertPro. All rights
              reserved.
            </p>
            <p className="text-sm text-gray-600">
              Made with <span className="text-red-400">&#9829;</span> for
              freelancers
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   LIVE DEMO COMPONENT — interactive proposal generation preview
   ═══════════════════════════════════════════════════════════════════════ */
function LiveDemo() {
  const [activeTab, setActiveTab] = useState(0);
  const [phase, setPhase] = useState("job"); // "job" | "analyzing" | "insights" | "proposal"
  const [proposalText, setProposalText] = useState("");
  const [typingDone, setTypingDone] = useState(false);

  const job = DEMO_JOBS[activeTab];

  // Reset when tab changes
  useEffect(() => {
    setPhase("job");
    setProposalText("");
    setTypingDone(false);
  }, [activeTab]);

  // Typing effect for proposal
  useEffect(() => {
    if (phase !== "proposal") return;
    setTypingDone(false);
    let i = 0;
    const text = job.proposal;
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
    }, 12);
    return () => clearInterval(id);
  }, [phase, job.proposal]);

  function handleAnalyze() {
    setPhase("analyzing");
    setTimeout(() => setPhase("insights"), 1500);
    setTimeout(() => setPhase("proposal"), 3000);
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Tab selector */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        {DEMO_JOBS.map((j, i) => (
          <button
            key={j.tab}
            onClick={() => setActiveTab(i)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === i
                ? "bg-[#00F0B5]/[0.1] text-[#00F0B5] border border-[#00F0B5]/20"
                : "text-gray-500 border border-white/[0.06] hover:text-gray-300 hover:border-white/[0.12]"
            }`}
          >
            {j.tab}
          </button>
        ))}
      </div>

      {/* Demo panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Panel 1: Job Posting */}
        <div className="glass-card rounded-2xl p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-[#00F0B5]" />
            <h3 className="text-sm font-bold text-white">Job Posting</h3>
            <span className="ml-auto px-2 py-0.5 bg-white/[0.06] text-gray-400 text-[10px] font-semibold rounded-md uppercase tracking-wider">
              Paste &amp; analyze
            </span>
          </div>
          <div className="bg-[#020617]/60 border border-white/[0.06] rounded-xl p-4 flex-1 mb-4">
            <h4 className="text-sm font-semibold text-white mb-2">
              {job.title}
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-line">
              {job.body}
            </p>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={phase !== "job"}
            className="w-full py-3 bg-[#00F0B5] text-[#020617] text-sm font-bold rounded-xl hover:bg-[#00dba5] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {phase === "job"
              ? "Analyze & Generate"
              : phase === "analyzing"
                ? "Analyzing..."
                : "Generated"}
          </button>
        </div>

        {/* Panel 2: Job Insights */}
        <div className="glass-card rounded-2xl p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">Job Insights</h3>
            <span className="ml-auto px-2 py-0.5 bg-white/[0.06] text-gray-400 text-[10px] font-semibold rounded-md uppercase tracking-wider">
              AI analysis
            </span>
          </div>

          {phase === "job" ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              Click &quot;Analyze &amp; Generate&quot; to start
            </div>
          ) : phase === "analyzing" ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-[#00F0B5] animate-spin" />
              <p className="text-sm text-gray-400">Analyzing job posting...</p>
            </div>
          ) : (
            <div className="space-y-5 flex-1">
              {/* Quality Score */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                    Job Quality
                  </span>
                  <span className="text-2xl font-extrabold text-[#00F0B5]">
                    {job.quality}
                  </span>
                </div>
                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00F0B5] to-[#00D4FF] rounded-full transition-all duration-1000"
                    style={{ width: `${job.quality}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {job.qualityLabel}
                </p>
              </div>

              {/* Signals */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Signals
                </p>
                <div className="space-y-1.5">
                  {job.signals.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {s.good ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#00F0B5] shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span
                        className={
                          s.good ? "text-gray-300" : "text-amber-400/80"
                        }
                      >
                        {s.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skill Match */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                    Skill Match
                  </span>
                  <span className="text-lg font-bold text-[#00F0B5]">
                    {job.skillMatch}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {job.skills.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 bg-[#00F0B5]/[0.08] border border-[#00F0B5]/15 text-[#00F0B5] text-[11px] font-medium rounded-md"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Panel 3: Generated Proposal */}
        <div className="glass-card rounded-2xl p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Your Proposal</h3>
            <span className="ml-auto px-2 py-0.5 bg-white/[0.06] text-gray-400 text-[10px] font-semibold rounded-md uppercase tracking-wider">
              Personalized
            </span>
          </div>

          {phase !== "proposal" ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              {phase === "job"
                ? "Your tailored proposal will appear here"
                : "Generating your proposal..."}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="bg-[#020617]/60 border border-white/[0.06] rounded-xl p-4">
                <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                  {proposalText}
                  {!typingDone && (
                    <span className="inline-block w-0.5 h-3.5 bg-[#00F0B5] animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </p>
              </div>
              {typingDone && (
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3 text-[11px] text-gray-500">
                    <span>
                      Tone: <span className="text-gray-300">Confident</span>
                    </span>
                    <span>
                      Words:{" "}
                      <span className="text-gray-300">
                        {job.proposal.split(/\s+/).length}
                      </span>
                    </span>
                  </div>
                </div>
              )}
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
    <div className="group glass-card rounded-2xl p-7 hover:border-[#00F0B5]/15 transition-all duration-300 relative overflow-hidden">
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
        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
          highlighted
            ? "bg-[#00F0B5]/15 text-[#00F0B5]"
            : "bg-white/[0.06] text-gray-400"
        }`}
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
