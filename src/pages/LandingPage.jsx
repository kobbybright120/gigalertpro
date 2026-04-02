import { Link } from "react-router-dom";
import {
  Zap,
  ArrowRight,
  Radio,
  Sparkles,
  UserCircle,
  CheckCircle2,
  Quote,
  Shield,
  Clock,
  BarChart3,
  Check,
  Star,
} from "lucide-react";

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
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-2"
            >
              Sign In
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
        {/* Background grid effect */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDI0MCwxODEsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-60"></div>
        {/* Ambient glow orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#00F0B5]/[0.04] rounded-full blur-[100px]"></div>
        <div className="absolute top-40 -left-40 w-[400px] h-[400px] bg-[#00D4FF]/[0.03] rounded-full blur-[80px]"></div>
        <div className="absolute top-20 -right-40 w-[400px] h-[400px] bg-[#7c3aed]/[0.03] rounded-full blur-[80px]"></div>

        <div className="relative max-w-4xl mx-auto px-4 pt-28 pb-24 text-center">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 glass-card rounded-full mb-10 border border-[#00F0B5]/15">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]"></span>
            </span>
            <span className="text-sm text-[#00F0B5] font-medium tracking-wide">
              Scanning 37+ sources in real-time
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight">
            Find freelance gigs <br className="hidden sm:block" />
            <span className="text-gradient">before anyone else.</span>
          </h1>

          <p className="mt-7 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            We scan Reddit, Craigslist & X/Twitter every 2 minutes for your
            keywords, then alert you instantly. Be the first to apply — win more
            projects.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12">
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-[#00F0B5] text-[#020617] font-bold rounded-full hover:bg-[#00dba5] hover:shadow-[0_0_32px_rgba(0,240,181,0.3)] transition-all duration-300 text-base"
            >
              Start Finding Gigs
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 px-8 py-4 border border-white/10 text-gray-300 font-semibold rounded-full hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300 text-base"
            >
              View Demo Dashboard
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-14 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#00F0B5]/60" /> Free to use
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#00F0B5]/60" /> 2-min scan cycle
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-[#00F0B5]/60" /> 37+ sources
            </span>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="relative border-y border-white/[0.04] bg-[#0B1120]/40">
        <div className="max-w-5xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "37+", label: "Sources Monitored" },
            { value: "2 min", label: "Scan Frequency" },
            { value: "10", label: "Craigslist Cities" },
            { value: "24/7", label: "Always Active" },
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
      <section className="relative py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Your Unfair Advantage
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              Stop refreshing job boards. Let the gigs come to you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <FeatureCard
              icon={Radio}
              title="Smart Gig Radar"
              description='Set keywords like "React developer" or "logo design". We monitor 37+ sources across Reddit, Craigslist & X/Twitter 24/7 and alert you within minutes.'
              accent="from-[#00F0B5] to-[#00D4FF]"
            />
            <FeatureCard
              icon={Sparkles}
              title="AI Proposal Helper"
              badge="AI-Powered"
              description="Don't stare at a blank page. Our AI uses your profile and the gig description to generate a highly-tailored pitch in seconds."
              accent="from-[#7c3aed] to-[#a78bfa]"
            />
            <FeatureCard
              icon={UserCircle}
              title="Profile Hub"
              description="Showcase your skills, bio, and testimonials in a professional portfolio. Give the AI context to craft better proposals."
              accent="from-[#f59e0b] to-[#fbbf24]"
            />
          </div>
        </div>
      </section>

      {/* ── How it Works ── */}
      <section className="relative py-28 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Three steps to your next gig
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Add Keywords",
                desc: "Enter skills or roles you want to track. Our radar starts scanning immediately.",
              },
              {
                step: "02",
                title: "Get Matched",
                desc: "We surface the most relevant gigs scored by quality, recency, and keyword match.",
              },
              {
                step: "03",
                title: "Apply First",
                desc: "Get notified instantly. Generate an AI proposal and apply before the crowd.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="relative group">
                <div className="glass-card rounded-2xl p-8 hover:border-[#00F0B5]/15 transition-all duration-300">
                  <span className="text-5xl font-black text-gradient opacity-30 group-hover:opacity-60 transition-opacity">
                    {step}
                  </span>
                  <h3 className="text-lg font-bold text-white mt-4 mb-2">
                    {title}
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="relative py-28 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#00F0B5] uppercase tracking-widest mb-3">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              Start free and upgrade when you're ready to go all-in.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free Tier */}
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

            {/* Pro Tier — Highlighted */}
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
                <PricingFeature text="AI Proposal Generator" highlighted />
                <PricingFeature
                  text="Priority scanning (every 1 min)"
                  highlighted
                />
                <PricingFeature text="Email + push notifications" highlighted />
                <PricingFeature
                  text="Proposal history & templates"
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

            {/* Elite Tier */}
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
            {/* Left: Stats & CTA */}
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
                <BenefitItem text="Increase your response rate with AI pitches" />
                <BenefitItem text="Cover Reddit, Craigslist & X/Twitter automatically" />
              </div>

              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 px-8 py-4 mt-12 bg-[#00F0B5] text-[#020617] font-bold rounded-full hover:bg-[#00dba5] hover:shadow-[0_0_32px_rgba(0,240,181,0.3)] transition-all duration-300 text-base"
              >
                Create Your Account
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Right: Testimonials */}
            <div className="space-y-5">
              <TestimonialCard
                quote="GigAlertPro found a Reddit post looking for a designer 3 minutes after it went live. The AI generated a proposal, I tweaked it, and closed a $3,000 project."
                name="Sarah J."
                role="UI Designer"
                initials="SJ"
                color="from-yellow-400 to-orange-400"
              />
              <TestimonialCard
                quote="I used to spend 2 hours a day scrolling Discord communities. Now I just wait for the ping. Best investment for my freelance business."
                name="Marcus T."
                role="React Developer"
                initials="MT"
                color="from-[#00F0B5] to-[#00D4FF]"
              />
              <TestimonialCard
                quote="The keyword scoring is really smart. I only see the gigs that actually matter. No noise, just opportunities."
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
            <div className="absolute inset-0 bg-gradient-to-br from-[#00F0B5]/[0.06] to-[#00D4FF]/[0.03]"></div>
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                Ready to win more gigs?
              </h2>
              <p className="text-gray-400 text-lg max-w-lg mx-auto mb-8">
                Join freelancers who are landing projects by being first to
                respond. Free to get started.
              </p>
              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 px-8 py-4 bg-[#00F0B5] text-[#020617] font-bold rounded-full hover:bg-[#00dba5] hover:shadow-[0_0_32px_rgba(0,240,181,0.3)] transition-all duration-300 text-base"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.04] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-sm text-gray-500">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#00F0B5] to-[#00D4FF] flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-[#020617]" />
            </div>
            <span>GigAlertPro &copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link to="/auth" className="hover:text-gray-300 transition-colors">
              Sign In
            </Link>
            <Link to="/auth" className="hover:text-gray-300 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Feature Card ── */
function FeatureCard({ icon: Icon, title, description, badge, accent }) {
  return (
    <div className="group glass-card rounded-2xl p-7 hover:border-[#00F0B5]/15 transition-all duration-300 relative overflow-hidden">
      {/* Subtle top accent line */}
      <div
        className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
      ></div>
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

/* ── Pricing Feature ── */
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

/* ── Benefit check item ── */
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

/* ── Testimonial Card ── */
function TestimonialCard({ quote, name, role, initials, color }) {
  return (
    <div className="glass-card rounded-2xl p-6 relative hover:border-white/10 transition-all duration-300">
      <Quote className="w-5 h-5 text-[#00F0B5]/20 absolute top-6 right-6" />
      <p className="text-gray-300 leading-relaxed mb-5 pr-6">"{quote}"</p>
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
