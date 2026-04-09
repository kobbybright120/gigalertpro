import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ArrowRight } from "lucide-react";

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (isSignUp && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    const result = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);
    setSubmitting(false);

    if (result.success) {
      if (isSignUp && result.confirmEmail) {
        setSuccess("Check your email for a confirmation link, then sign in.");
        setIsSignUp(false);
      } else {
        navigate("/dashboard");
      }
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
            <img
              src="/logo/icon.svg?v=20260409"
              alt="GigAlertPro"
              className="w-10 h-10 rounded-xl object-cover shadow-[0_0_20px_rgba(0,240,181,0.15)]"
            />
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

          {success && (
            <div className="mb-5 p-3.5 bg-[#00F0B5]/[0.06] border border-[#00F0B5]/15 text-[#00F0B5] text-sm rounded-xl">
              {success}
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

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/[0.06]"></div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              or
            </span>
            <div className="flex-1 h-px bg-white/[0.06]"></div>
          </div>

          {/* Google sign-in */}
          <button
            type="button"
            onClick={async () => {
              setError("");
              const result = await signInWithGoogle();
              if (!result.success) setError(result.error);
            }}
            className="w-full flex items-center justify-center gap-3 py-3 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span className="text-sm font-semibold text-gray-300">
              Continue with Google
            </span>
          </button>

          <p className="text-center text-sm text-gray-500 mt-7">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
                setSuccess("");
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
