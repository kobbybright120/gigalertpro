import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Zap, ArrowRight } from "lucide-react";

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
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#00F0B5]/[0.03] rounded-full blur-[100px]"></div>
      <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] bg-[#00D4FF]/[0.02] rounded-full blur-[80px]"></div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 text-3xl font-bold text-white">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F0B5] to-[#00D4FF] flex items-center justify-center shadow-[0_0_20px_rgba(0,240,181,0.15)]">
              <Zap className="w-5.5 h-5.5 text-[#020617]" />
            </div>
            <span>
              GigAlert<span className="text-gradient">Pro</span>
            </span>
          </div>
          <p className="text-gray-500 mt-3 text-sm">
            Find and win gigs faster than anyone.
          </p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-8 glow-green">
          <h2 className="text-2xl font-extrabold text-white mb-1.5 tracking-tight">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h2>
          <p className="text-gray-500 text-sm mb-7">
            {isSignUp
              ? "Start finding gigs in minutes"
              : "Sign in to your dashboard"}
          </p>

          {error && (
            <div className="mb-5 p-3.5 bg-red-500/[0.06] border border-red-500/15 text-red-400 text-sm rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#020617]/60 border border-white/[0.06] rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-[#00F0B5]/30 focus:border-[#00F0B5]/20 outline-none transition-all duration-200 text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#020617]/60 border border-white/[0.06] rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-[#00F0B5]/30 focus:border-[#00F0B5]/20 outline-none transition-all duration-200 text-sm"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="group w-full py-3 bg-[#00F0B5] text-[#020617] font-bold rounded-xl hover:bg-[#00dba5] hover:shadow-[0_0_24px_rgba(0,240,181,0.25)] transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting
                ? "Please wait…"
                : isSignUp
                  ? "Create Account"
                  : "Sign In"}
              {!submitting && (
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-7">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              className="text-[#00F0B5] font-semibold hover:text-[#00dba5] transition-colors"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
