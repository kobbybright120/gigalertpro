import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const sections = [
  { id: "data-we-collect", label: "Data We Collect" },
  { id: "how-we-collect", label: "How We Collect It" },
  { id: "why-we-collect", label: "Why We Collect It" },
  { id: "third-parties", label: "Who We Share It With" },
  { id: "platforms", label: "Platforms We Scan" },
  { id: "data-protection", label: "Data Protection" },
  { id: "your-rights", label: "Your Rights" },
  { id: "cookies", label: "Cookies & Local Storage" },
  { id: "email-notifications", label: "Email Notifications" },
  { id: "children", label: "Children's Privacy" },
  { id: "changes", label: "Changes to This Policy" },
  { id: "contact", label: "Contact" },
];

export default function PrivacyPage() {
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
          Privacy Policy
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
          <section id="data-we-collect">
            <h2 className="text-xl font-bold text-white mb-3">
              1. Data We Collect
            </h2>
            <p className="font-semibold text-white mb-2">Account Information</p>
            <ul className="space-y-1 list-disc list-inside text-gray-400">
              <li>Email address</li>
              <li>Password (stored as a secure hash, never in plain text)</li>
              <li>
                Name, bio, skills, portfolio links, hourly rate, and
                availability (if you fill out your profile)
              </li>
            </ul>

            <p className="font-semibold text-white mt-4 mb-2">
              If You Sign In with Google
            </p>
            <ul className="space-y-1 list-disc list-inside text-gray-400">
              <li>
                Email address, name, and profile picture from your Google
                account
              </li>
            </ul>

            <p className="font-semibold text-white mt-4 mb-2">Service Data</p>
            <ul className="space-y-1 list-disc list-inside text-gray-400">
              <li>
                Keywords you track (e.g., "React developer", "logo design")
              </li>
              <li>Gig alerts matched to your keywords</li>
              <li>Proposals you generate and save</li>
              <li>Gigs you bookmark</li>
              <li>Notification preferences and read/unread status</li>
            </ul>

            <p className="font-semibold text-white mt-4 mb-2">
              Usage Analytics
            </p>
            <p className="text-gray-400">
              We use Umami, a privacy-focused analytics tool, to collect
              anonymous usage data such as page views, button clicks, and scroll
              depth. Umami does not use cookies, does not collect personal
              information, and does not track you across websites.
            </p>
          </section>

          <section id="how-we-collect">
            <h2 className="text-xl font-bold text-white mb-3">
              2. How We Collect It
            </h2>
            <ul className="space-y-2 list-disc list-inside text-gray-400">
              <li>
                <span className="text-white font-medium">Signup form</span> —
                you provide your email and password when creating an account
              </li>
              <li>
                <span className="text-white font-medium">Google OAuth</span> —
                if you choose to sign in with Google, we receive your name,
                email, and profile picture from Google
              </li>
              <li>
                <span className="text-white font-medium">Profile page</span> —
                you optionally provide your name, bio, skills, portfolio links,
                and other professional details
              </li>
              <li>
                <span className="text-white font-medium">App usage</span> —
                keywords, proposals, and bookmarks are created as you use the
                service
              </li>
            </ul>
          </section>

          <section id="why-we-collect">
            <h2 className="text-xl font-bold text-white mb-3">
              3. Why We Collect It
            </h2>
            <ul className="space-y-2 list-disc list-inside text-gray-400">
              <li>
                <span className="text-white font-medium">Gig matching</span> —
                your keywords are used to find relevant freelance opportunities
                across multiple platforms
              </li>
              <li>
                <span className="text-white font-medium">Notifications</span> —
                your email is used to send gig alerts when matching
                opportunities are found
              </li>
              <li>
                <span className="text-white font-medium">
                  Proposal generation
                </span>{" "}
                — your profile information helps our AI generate personalized
                proposals
              </li>
              <li>
                <span className="text-white font-medium">Billing</span> — your
                email and subscription details are shared with our payment
                processor to manage your subscription
              </li>
              <li>
                <span className="text-white font-medium">
                  Service improvement
                </span>{" "}
                — anonymous usage analytics help us understand which features
                are useful
              </li>
            </ul>
          </section>

          <section id="third-parties">
            <h2 className="text-xl font-bold text-white mb-3">
              4. Who We Share It With
            </h2>
            <p className="mb-3">
              We do not sell your personal data. We share limited information
              with trusted third-party services only as necessary to operate
              GigAlertPro:
            </p>
            <ul className="space-y-2 list-disc list-inside text-gray-400">
              <li>
                <span className="text-white font-medium">Payment processor</span>{" "}
                — your email and subscription tier are shared to handle billing.
                We never see or store your credit card details.
              </li>
              <li>
                <span className="text-white font-medium">Email delivery service</span>{" "}
                — your email address is used to send gig alert notifications.
              </li>
              <li>
                <span className="text-white font-medium">
                  Authentication &amp; database provider
                </span>{" "}
                — your account and profile data is securely stored with our
                database provider.
              </li>
              <li>
                <span className="text-white font-medium">Analytics</span>{" "}
                — we use privacy-focused, anonymous analytics to understand
                product usage. No personal information is collected.
              </li>
            </ul>
          </section>

          <section id="platforms">
            <h2 className="text-xl font-bold text-white mb-3">
              5. Platforms We Scan
            </h2>
            <p>
              GigAlertPro scans publicly available posts on the following
              platforms to find freelance opportunities:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-gray-400">
              <li>Reddit (40+ freelance and hiring subreddits)</li>
              <li>X (Twitter)</li>
              <li>Threads</li>
              <li>Facebook (public job groups)</li>
              <li>LinkedIn</li>
              <li>Craigslist (gigs section)</li>
            </ul>
            <p className="mt-3">
              We only collect publicly available information from these
              platforms. We do not access private messages, private groups, or
              any content that requires authentication to view.
            </p>
          </section>

          <section id="data-protection">
            <h2 className="text-xl font-bold text-white mb-3">
              6. Data Protection
            </h2>
            <ul className="space-y-2 list-disc list-inside text-gray-400">
              <li>All data is transmitted over HTTPS (TLS encryption)</li>
              <li>
                Passwords are hashed using industry-standard algorithms and
                never stored in plain text
              </li>
              <li>
                Database access is protected by Row Level Security (RLS) so
                users can only access their own data
              </li>
              <li>
                API endpoints use JWT authentication to verify user identity
              </li>
              <li>
                Payment processing is handled entirely by Dodo Payments. We
                never see or store your credit card details
              </li>
              <li>
                Server-side operations use environment-secured service keys that
                are never exposed to the browser
              </li>
            </ul>
          </section>

          <section id="your-rights">
            <h2 className="text-xl font-bold text-white mb-3">
              7. Your Rights
            </h2>
            <p>You have the right to:</p>
            <ul className="mt-2 space-y-2 list-disc list-inside text-gray-400">
              <li>
                <span className="text-white font-medium">Access your data</span>{" "}
                — view all your profile information, keywords, and proposals
                from your dashboard
              </li>
              <li>
                <span className="text-white font-medium">Update your data</span>{" "}
                — edit your profile, keywords, and preferences at any time
              </li>
              <li>
                <span className="text-white font-medium">Delete your data</span>{" "}
                — email us at{" "}
                <a
                  href="https://mail.google.com/mail/?view=cm&fs=1&to=support@gigalertpro.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00F0B5] hover:underline"
                >
                  support@gigalertpro.com
                </a>{" "}
                to request complete deletion of your account and all associated
                data
              </li>
              <li>
                <span className="text-white font-medium">Export your data</span>{" "}
                — request a copy of your data by emailing us
              </li>
              <li>
                <span className="text-white font-medium">
                  Opt out of emails
                </span>{" "}
                — disable email notifications from your profile settings or use
                the unsubscribe link in any email
              </li>
            </ul>
          </section>

          <section id="cookies">
            <h2 className="text-xl font-bold text-white mb-3">
              8. Cookies & Local Storage
            </h2>
            <p>GigAlertPro uses minimal browser storage:</p>
            <ul className="mt-2 space-y-2 list-disc list-inside text-gray-400">
              <li>
                <span className="text-white font-medium">
                  Authentication tokens
                </span>{" "}
                — stored in localStorage to keep you signed in. These are
                session tokens from Supabase Auth.
              </li>
              <li>
                <span className="text-white font-medium">
                  Notification preferences
                </span>{" "}
                — stored in localStorage to remember your browser notification
                settings.
              </li>
              <li>
                <span className="text-white font-medium">Seen gig IDs</span> —
                stored in localStorage to track which gigs you've already seen
                so we can highlight new ones.
              </li>
            </ul>
            <p className="mt-3">
              We do not use third-party tracking cookies. Umami analytics is
              cookie-free.
            </p>
          </section>

          <section id="email-notifications">
            <h2 className="text-xl font-bold text-white mb-3">
              9. Email Notifications
            </h2>
            <p>
              Paid subscribers can opt in to email notifications. When enabled,
              we send you emails when new gigs matching your keywords are found.
            </p>
            <p className="mt-3">Limits and safeguards:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-gray-400">
              <li>Maximum 5 emails per day per user</li>
              <li>At least 30 minutes between emails</li>
              <li>Maximum 3 gigs per email</li>
              <li>Deduplication prevents the same gig from being sent twice</li>
            </ul>
            <p className="mt-3">To stop receiving emails:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-gray-400">
              <li>Toggle off "Notifications" on your profile page, or</li>
              <li>
                Click the "Unsubscribe" link at the bottom of any email we send
              </li>
            </ul>
          </section>

          <section id="children">
            <h2 className="text-xl font-bold text-white mb-3">
              10. Children's Privacy
            </h2>
            <p>
              GigAlertPro is not intended for anyone under the age of 18. We do
              not knowingly collect data from children. If you believe a child
              has created an account, please contact us and we will delete it
              promptly.
            </p>
          </section>

          <section id="changes">
            <h2 className="text-xl font-bold text-white mb-3">
              11. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. If we make
              significant changes, we'll notify you by email or through the
              service. The "Last updated" date at the top reflects the most
              recent revision.
            </p>
          </section>

          <section id="contact">
            <h2 className="text-xl font-bold text-white mb-3">12. Contact</h2>
            <p>
              If you have questions about this Privacy Policy or how we handle
              your data, contact us at{" "}
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
