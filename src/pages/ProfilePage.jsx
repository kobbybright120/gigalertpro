import { useState } from "react";
import {
  Save,
  X,
  User,
  Pencil,
  Briefcase,
  Link2,
  ExternalLink,
  MessageSquareQuote,
  Loader2,
} from "lucide-react";
import { useProfile } from "../lib/useSupabase";

export default function ProfilePage() {
  const { profile: dbProfile, loading, updateProfile } = useProfile();

  const profile = {
    name: dbProfile?.name || "",
    bio: dbProfile?.bio || "",
    skills: dbProfile?.skills || [],
    testimonials: dbProfile?.testimonials || [],
    portfolioLinks: dbProfile?.portfolio_links || [],
  };

  const [editing, setEditing] = useState(false);

  // Draft form state for modal
  const [draft, setDraft] = useState({});

  function openEditor() {
    setDraft({
      name: profile.name,
      bio: profile.bio,
      skills: profile.skills.join(", "),
      portfolioLinks: profile.portfolioLinks.join("\n"),
      testimonials: profile.testimonials.join("\n"),
    });
    setEditing(true);
  }

  async function handleSave() {
    const updated = {
      name: draft.name.trim(),
      bio: draft.bio.trim(),
      skills: draft.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      portfolio_links: draft.portfolioLinks
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      testimonials: draft.testimonials
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    await updateProfile(updated);
    setEditing(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-[#00F0B5] animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-0">
      {/* Edit Profile Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setEditing(false)}
          />
          <div className="relative w-full max-w-2xl bg-[#0B1120] border border-white/10 rounded-2xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditing(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <h2 className="text-2xl font-bold text-white mb-1">Edit Profile</h2>
            <p className="text-gray-400 text-sm mb-8">
              Update your public portfolio and give the AI context.
            </p>

            <div className="space-y-5">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="Your display name"
                  className="w-full px-4 py-3 bg-[#020617] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#00F0B5]/40 focus:border-transparent outline-none transition"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Bio{" "}
                  <span className="text-[#00F0B5] font-normal">
                    (Used heavily by AI for proposals)
                  </span>
                </label>
                <textarea
                  value={draft.bio}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, bio: e.target.value }))
                  }
                  rows={4}
                  placeholder="Tell clients about yourself..."
                  className="w-full px-4 py-3 bg-[#020617] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#00F0B5]/40 focus:border-transparent outline-none transition resize-y"
                />
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Skills{" "}
                  <span className="text-[#00F0B5] font-normal">
                    (Comma separated)
                  </span>
                </label>
                <input
                  type="text"
                  value={draft.skills}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, skills: e.target.value }))
                  }
                  placeholder="React developer, Logo designer, html"
                  className="w-full px-4 py-3 bg-[#020617] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#00F0B5]/40 focus:border-transparent outline-none transition"
                />
              </div>

              {/* Portfolio Links + Testimonials side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Portfolio Links{" "}
                    <span className="text-[#00F0B5] font-normal">
                      (One per line)
                    </span>
                  </label>
                  <textarea
                    value={draft.portfolioLinks}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        portfolioLinks: e.target.value,
                      }))
                    }
                    rows={4}
                    placeholder={"facebook.com\nx.com"}
                    className="w-full px-4 py-3 bg-[#020617] border border-white/10 rounded-xl text-white placeholder-gray-500 font-mono text-sm focus:ring-2 focus:ring-[#00F0B5]/40 focus:border-transparent outline-none transition resize-y"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Testimonials{" "}
                    <span className="text-[#00F0B5] font-normal">
                      (One per line)
                    </span>
                  </label>
                  <textarea
                    value={draft.testimonials}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        testimonials: e.target.value,
                      }))
                    }
                    rows={4}
                    placeholder={"alex is a good dev\nfast"}
                    className="w-full px-4 py-3 bg-[#020617] border border-white/10 rounded-xl text-white placeholder-gray-500 font-mono text-sm focus:ring-2 focus:ring-[#00F0B5]/40 focus:border-transparent outline-none transition resize-y"
                  />
                </div>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#00F0B5] text-[#020617] font-semibold rounded-xl hover:bg-[#00dba5] transition-colors"
              >
                <Save className="w-5 h-5" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gradient Banner */}
      <div className="relative h-44 rounded-t-2xl bg-gradient-to-r from-[#0B1120] via-[#0a3d2e] to-[#0d4f5a] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-[#00F0B5]/5 to-[#00D4FF]/10" />
        <button
          onClick={openEditor}
          className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/10 text-gray-200 text-sm font-medium rounded-lg hover:bg-white/20 transition-colors"
        >
          <Pencil className="w-4 h-4" />
          Edit Profile
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 -mt-16 relative z-10 px-2">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Card */}
          <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-6 pt-0 text-center">
            <div className="flex justify-center -mt-10 mb-4">
              <div className="w-20 h-20 rounded-xl bg-[#0B1120] border-2 border-white/10 flex items-center justify-center shadow-lg">
                <User className="w-10 h-10 text-[#00F0B5]" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-white">
              {profile.name || "Your Name"}
            </h2>
            <p className="text-gray-400 text-sm mt-1 flex items-center justify-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#00F0B5]" />
              Available Worldwide
            </p>

            {/* Core Skills */}
            <div className="mt-6 text-left">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4 text-[#00F0B5]" />
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                  Core Skills
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.skills.length > 0 ? (
                  profile.skills.map((skill, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 bg-white/5 text-gray-300 text-sm rounded-lg border border-white/10"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <p className="text-gray-600 text-sm">No skills added yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Portfolio Links Card */}
          <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Link2 className="w-4 h-4 text-[#00F0B5]" />
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                Portfolio Links
              </h3>
            </div>
            <div className="space-y-2">
              {profile.portfolioLinks.length > 0 ? (
                profile.portfolioLinks.map((link, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-500 shrink-0" />
                    <a
                      href={link.startsWith("http") ? link : `https://${link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-300 hover:text-[#00F0B5] transition-colors truncate"
                    >
                      {link}
                    </a>
                  </div>
                ))
              ) : (
                <p className="text-gray-600 text-sm">No links added yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-3 space-y-6 lg:mt-16">
          {/* About Me Card */}
          <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-3">About Me</h3>
            <p className="text-gray-400 leading-relaxed">
              {profile.bio ||
                "No bio added yet. Click Edit Profile to add one."}
            </p>
          </div>

          {/* Client Testimonials Card */}
          <div className="bg-[#0B1120] border border-white/5 rounded-2xl overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-[#00F0B5] to-[#00D4FF]" />
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquareQuote className="w-5 h-5 text-[#00F0B5]" />
                <h3 className="text-xl font-bold text-white">
                  Client Testimonials
                </h3>
              </div>
              <div className="space-y-3">
                {profile.testimonials.length > 0 ? (
                  profile.testimonials.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 bg-[#020617] border border-white/5 rounded-lg"
                    >
                      <p className="text-gray-300 text-sm italic">"{t}"</p>
                      <MessageSquareQuote className="w-8 h-8 text-white/5 shrink-0 ml-4" />
                    </div>
                  ))
                ) : (
                  <p className="text-gray-600 text-sm">
                    No testimonials yet. Click Edit Profile to add some.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
