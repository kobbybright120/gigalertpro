import { Link } from "react-router-dom";
import {
  Zap,
  ArrowRight,
  Radio,
  Sparkles,
  UserCircle,
  CheckCircle2,
  Quote,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#020617] text-white font-sans">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-[#020617]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-bold tracking-tight"
          >
            <Zap className="w-6 h-6 text-[#00F0B5]" />
            <span>
              GigAlert<span className="text-[#00F0B5]">Pro</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/auth"
              className="text-sm text-gray-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#00F0B5] text-[#020617] text-sm font-semibold rounded-full hover:bg-[#00dba5] transition-colors"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Background grid effect */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDI0MCwxODEsMC4wNCkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-60"></div>
        {/* Top gradient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#00F0B5]/5 rounded-full blur-3xl"></div>

        <div className="relative max-w-4xl mx-auto px-4 pt-24 pb-20 text-center">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#00F0B5]/10 border border-[#00F0B5]/20 rounded-full mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0B5] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0B5]"></span>
            </span>
            <span className="text-sm text-[#00F0B5] font-medium">
              Smart Gig Alerts are Live
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight tracking-tight">
            Win more freelance work{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00F0B5] to-[#00D4FF]">
              automatically.
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            We scan Reddit, Discord, and job boards for your keywords. When a
            match is found, our AI writes a personalized proposal instantly.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#00F0B5] text-[#020617] font-semibold rounded-full hover:bg-[#00dba5] transition-colors text-base"
            >
              Start Finding Gigs <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 px-7 py-3.5 border border-gray-600 text-gray-300 font-semibold rounded-full hover:bg-white/5 transition-colors text-base"
            >
              View Demo Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold">
              Your Unfair Advantage
            </h2>
            <p className="mt-4 text-gray-400 text-lg">
              Stop refreshing job boards. Let the gigs come to you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={Radio}
              title="Smart Gig Alerts"
              description='Set keywords like "React developer" or "logo design". We monitor the web 24/7 and alert you the second a gig is posted.'
            />
            <FeatureCard
              icon={Sparkles}
              title="AI Proposal Helper"
              badge="Powered by OpenAI"
              description="Don't stare at a blank page. Our AI uses your profile and the gig description to generate a highly-tailored pitch in seconds."
            />
            <FeatureCard
              icon={UserCircle}
              title="Profile Hub"
              description="Get a stunning, SEO-friendly public portfolio page to showcase your skills, bio, and testimonials to prospective clients."
            />
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="relative py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            {/* Left: Stats & CTA */}
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                Freelancers are booking{" "}
                <span className="text-[#00F0B5]">$5k+ projects</span> in their
                sleep.
              </h2>

              <div className="mt-8 space-y-4">
                <BenefitItem text="Be the first to apply to high-paying gigs" />
                <BenefitItem text="Save 10+ hours a week on prospecting" />
                <BenefitItem text="Increase your response rate with AI pitches" />
              </div>

              <Link
                to="/auth"
                className="inline-flex items-center gap-2 px-7 py-3.5 mt-10 bg-[#00F0B5] text-[#020617] font-semibold rounded-full hover:bg-[#00dba5] transition-colors text-base"
              >
                Create Your Account
              </Link>
            </div>

            {/* Right: Testimonials */}
            <div className="space-y-6">
              <TestimonialCard
                quote="GigAlertPro found a Reddit post looking for a designer 3 minutes after it went live. The AI generated a proposal, I tweaked it, and closed a $3,000 project."
                name="Sarah J."
                role="UI Designer"
                color="bg-yellow-400"
              />
              <TestimonialCard
                quote="I used to spend 2 hours a day scrolling Discord communities. Now I just wait for the ping. Best investment for my freelance business."
                name="Marcus T."
                role="React Dev"
                color="bg-[#00F0B5]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Zap className="w-4 h-4 text-[#00F0B5]" />
            <span>GigAlertPro &copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link to="/auth" className="hover:text-white transition-colors">
              Sign In
            </Link>
            <Link to="/auth" className="hover:text-white transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Feature Card ── */
function FeatureCard({ icon: Icon, title, description, badge }) {
  return (
    <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-7 hover:border-[#00F0B5]/20 transition-colors">
      <div className="flex items-start justify-between mb-5">
        <div className="w-12 h-12 rounded-xl bg-[#00F0B5]/10 flex items-center justify-center">
          <Icon className="w-6 h-6 text-[#00F0B5]" />
        </div>
        {badge && (
          <span className="px-2.5 py-1 bg-[#00F0B5]/10 text-[#00F0B5] text-xs font-semibold rounded-full">
            {badge}
          </span>
        )}
      </div>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

/* ── Benefit check item ── */
function BenefitItem({ text }) {
  return (
    <div className="flex items-center gap-3">
      <CheckCircle2 className="w-5 h-5 text-[#00F0B5] shrink-0" />
      <span className="text-gray-300">{text}</span>
    </div>
  );
}

/* ── Testimonial Card ── */
function TestimonialCard({ quote, name, role, color }) {
  return (
    <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-6 relative">
      <Quote className="w-5 h-5 text-[#00F0B5]/30 absolute top-5 right-5" />
      <p className="text-gray-300 leading-relaxed mb-5">"{quote}"</p>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full ${color}`}></div>
        <div>
          <p className="font-semibold text-sm">{name}</p>
          <p className="text-xs text-gray-500">{role}</p>
        </div>
      </div>
    </div>
  );
}
