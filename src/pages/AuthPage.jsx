import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Zap } from "lucide-react";

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setSubmitting(true);
    const result = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);
    setSubmitting(false);

    if (result.success) {
      navigate("/dashboard");
    } else {
      setError(result.error || "Authentication failed. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-3xl font-bold text-white">
            <Zap className="w-8 h-8 text-[#00F0B5]" />
            <span>
              GigAlert<span className="text-[#00F0B5]">Pro</span>
            </span>
          </div>
          <p className="text-gray-400 mt-2">Find and win gigs faster.</p>
        </div>

        {/* Card */}
        <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#020617] border border-white/10 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-[#00F0B5]/40 focus:border-transparent outline-none transition"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#020617] border border-white/10 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-[#00F0B5]/40 focus:border-transparent outline-none transition"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-[#00F0B5] text-[#020617] font-semibold rounded-lg hover:bg-[#00dba5] transition-colors disabled:opacity-50"
            >
              {submitting ? "Please wait…" : isSignUp ? "Sign Up" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              className="text-[#00F0B5] font-semibold hover:underline"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
