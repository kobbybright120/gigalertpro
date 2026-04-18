import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "eligibility", label: "Eligibility" },
  { id: "accounts", label: "Accounts" },
  { id: "plans", label: "Plans & Pricing" },
  { id: "guarantee", label: "3-Day Money Back Guarantee" },
  { id: "cancellation", label: "Cancellation" },
  { id: "acceptable-use", label: "Acceptable Use" },
  { id: "disclaimer", label: "Disclaimer" },
  { id: "ip", label: "Intellectual Property" },
  { id: "liability", label: "Limitation of Liability" },
  { id: "changes", label: "Changes to Terms" },
  { id: "contact", label: "Contact" },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#020617] text-gray-300 font-sans">
      {/* Header */}
      <nav className="sticky top-0 z-40 bg-[#020617]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <span className="text-white/10">|</span>
          <Link to="/" className="text-white font-bold text-sm">
            GigAlert<span className="text-[#00F0B5]">Pro</span>
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-gray-500 mb-10">
          Last updated: April 18, 2026
        </p>

        {/* Table of Contents */}
        <div className="mb-12 p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            Table of Contents
          </p>
          <ol className="space-y-1.5">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-sm text-gray-400 hover:text-[#00F0B5] transition-colors"
                >
                  {i + 1}. {s.label}
                </a>
              </li>
            ))}
          </ol>
        </div>

        {/* Sections */}
        <div className="space-y-10 text-sm leading-relaxed">
          <section id="overview">
            <h2 className="text-xl font-bold text-white mb-3">1. Overview</h2>
            <p>
              GigAlertPro is a gig-matching service for freelancers and
              independent professionals. We scan public posts across platforms
              like Reddit, X (Twitter), Threads, Facebook, LinkedIn, and Craigslist to
              find freelance opportunities that match your skills and keywords.
            </p>
            <p className="mt-3">
              When we find a match, we alert you via browser notifications and
              email so you can respond quickly. We also provide AI-powered
              proposal generation to help you craft responses.
            </p>
            <p className="mt-3">
              By using GigAlertPro, you agree to these Terms of Service. If you
              do not agree, please do not use the service.
            </p>
          </section>

          <section id="eligibility">
            <h2 className="text-xl font-bold text-white mb-3">
              2. Eligibility
            </h2>
            <p>
              You must be at least 18 years old to use GigAlertPro. By creating
              an account, you confirm that you are a freelancer, independent
              contractor, or professional seeking work opportunities.
            </p>
          </section>

          <section id="accounts">
            <h2 className="text-xl font-bold text-white mb-3">3. Accounts</h2>
            <p>
              You can create an account using your email and password, or sign
              in with Google. You are responsible for keeping your login
              credentials secure. Notify us immediately at{" "}
              <a
                href="https://mail.google.com/mail/?view=cm&fs=1&to=support@gigalertpro.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00F0B5] hover:underline"
              >
                support@gigalertpro.com
              </a>{" "}
              if you suspect unauthorized access to your account.
            </p>
          </section>

          <section id="plans">
            <h2 className="text-xl font-bold text-white mb-3">
              4. Plans & Pricing
            </h2>
            <p>GigAlertPro offers two paid subscription plans:</p>
            <div className="mt-4 space-y-3">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <p className="font-bold text-white">
                  Basic — $12/month or $122/year
                </p>
                <p className="mt-1 text-gray-400">
                  25 daily alerts, Reddit/X/Threads/LinkedIn scanning, 5 keyword
                  trackers, gig quality scoring, 10 AI proposals per day,
                  browser and email notifications, profile builder.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-[#00F0B5]/20">
                <p className="font-bold text-white">
                  Pro — $29/month or $296/year
                </p>
                <p className="mt-1 text-gray-400">
                  Everything in Basic plus 100 daily alerts, 20 keyword
                  trackers, unlimited AI proposals, AI learns from winning
                  proposals, priority scanning every 10 minutes, and
                  won/reply/no response analytics.
                </p>
              </div>
            </div>
            <p className="mt-4">
              Prices are in USD. Annual plans include a 15% discount. We reserve
              the right to change pricing with 30 days notice to existing
              subscribers.
            </p>
          </section>

          <section id="guarantee">
            <h2 className="text-xl font-bold text-white mb-3">
              5. 3-Day Money Back Guarantee
            </h2>
            <p>
              If GigAlertPro doesn't find you relevant gigs within 3 days of
              your subscription, we'll refund you completely. No questions
              asked.
            </p>
            <p className="mt-3">To request a refund within the 3-day window:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-gray-400">
              <li>
                Email{" "}
                <a
                  href="https://mail.google.com/mail/?view=cm&fs=1&to=support@gigalertpro.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00F0B5] hover:underline"
                >
                  support@gigalertpro.com
                </a>{" "}
                with your account email
              </li>
              <li>We'll process your full refund within 3-5 business days</li>
              <li>
                The 3-day period starts from the moment your subscription is
                activated
              </li>
            </ul>
          </section>

          <section id="cancellation">
            <h2 className="text-xl font-bold text-white mb-3">
              6. Cancellation
            </h2>
            <p>
              You can cancel your subscription at any time from your profile
              settings. When you cancel:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-gray-400">
              <li>
                Your subscription remains active until the end of your current
                billing period
              </li>
              <li>
                You retain access to all paid features until your billing period
                ends
              </li>
              <li>
                No partial refunds are given for unused time after the 3-day
                guarantee window
              </li>
            </ul>
          </section>

          <section id="acceptable-use">
            <h2 className="text-xl font-bold text-white mb-3">
              7. Acceptable Use
            </h2>
            <p>You agree not to:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-gray-400">
              <li>
                Use GigAlertPro for any illegal purpose or to violate any laws
              </li>
              <li>
                Scrape, crawl, or extract data from GigAlertPro for commercial
                use
              </li>
              <li>
                Share your account credentials or let others use your account
              </li>
              <li>
                Attempt to reverse engineer, decompile, or hack the service
              </li>
              <li>
                Use automated tools to interact with GigAlertPro beyond its
                intended interface
              </li>
              <li>
                Send spam or unsolicited messages using proposals generated by
                our AI
              </li>
            </ul>
          </section>

          <section id="disclaimer">
            <h2 className="text-xl font-bold text-white mb-3">8. Disclaimer</h2>
            <p>
              GigAlertPro scans publicly available posts across Reddit, X,
              Threads, Facebook, LinkedIn, and Craigslist. We provide this information as
              a convenience to help you find freelance opportunities.
            </p>
            <p className="mt-3 font-semibold text-white">We do not:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-gray-400">
              <li>
                Guarantee the quality, legitimacy, or accuracy of any gig
                posting
              </li>
              <li>Verify the identity or credibility of people posting gigs</li>
              <li>
                Guarantee that you will receive work or income from using the
                service
              </li>
              <li>Act as an intermediary between you and potential clients</li>
            </ul>
            <p className="mt-3">
              You are solely responsible for evaluating gig opportunities and
              conducting your own due diligence before engaging with any
              potential client. GigAlertPro is a discovery tool, not an
              employment agency.
            </p>
          </section>

          <section id="ip">
            <h2 className="text-xl font-bold text-white mb-3">
              9. Intellectual Property
            </h2>
            <p>
              GigAlertPro, its logo, design, and underlying technology are owned
              by GigAlertPro. You may not copy, modify, or distribute any part
              of the service without written permission.
            </p>
            <p className="mt-3">
              Content you create within GigAlertPro (your profile, keywords,
              proposals) remains yours. By using the service, you grant us a
              limited license to process this content solely to provide the
              service to you.
            </p>
          </section>

          <section id="liability">
            <h2 className="text-xl font-bold text-white mb-3">
              10. Limitation of Liability
            </h2>
            <p>
              GigAlertPro is provided "as is" without warranties of any kind,
              either express or implied. To the maximum extent permitted by law:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-gray-400">
              <li>
                We are not liable for any indirect, incidental, or consequential
                damages
              </li>
              <li>
                Our total liability is limited to the amount you paid for the
                service in the 12 months preceding the claim
              </li>
              <li>
                We are not responsible for downtime, data loss, or service
                interruptions
              </li>
            </ul>
          </section>

          <section id="changes">
            <h2 className="text-xl font-bold text-white mb-3">
              11. Changes to Terms
            </h2>
            <p>
              We may update these Terms of Service from time to time. If we make
              significant changes, we'll notify you by email or through the
              service. Your continued use of GigAlertPro after changes take
              effect means you accept the updated terms.
            </p>
          </section>

          <section id="contact">
            <h2 className="text-xl font-bold text-white mb-3">12. Contact</h2>
            <p>
              If you have questions about these terms, contact us at{" "}
              <a
                href="https://mail.google.com/mail/?view=cm&fs=1&to=support@gigalertpro.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00F0B5] hover:underline"
              >
                support@gigalertpro.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
