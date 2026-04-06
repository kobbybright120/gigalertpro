import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const DISABLE_AUTH =
    import.meta.env.VITE_DISABLE_AUTH === "true" ||
    !VITE_SUPABASE_URL ||
    VITE_SUPABASE_URL.includes("placeholder") ||
    !VITE_SUPABASE_ANON_KEY;

  // Runtime diagnostic: log once on mount (DEV shows config; PROD only warns)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const host = window.location.hostname || "";
      if (host.includes("vercel.app") || host.includes("gigalertpro")) {
        if (import.meta.env.DEV) {
          // Non-sensitive info only in DEV
          // eslint-disable-next-line no-console
          console.info("[Auth] runtime config:", {
            DISABLE_AUTH,
            VITE_SUPABASE_URL: VITE_SUPABASE_URL || null,
            host,
          });
        } else {
          if (DISABLE_AUTH) {
            // eslint-disable-next-line no-console
            console.warn(
              "[Auth] WARNING: Demo auth (DISABLE_AUTH) is active in production.\n" +
                "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Vercel Production envs and redeploy.",
            );
          }
        }
      }
    } catch {
      // ignore logging errors
    }
  }, [DISABLE_AUTH, VITE_SUPABASE_URL]);

  useEffect(() => {
    if (DISABLE_AUTH) {
      // In demo mode we skip Supabase auth calls to avoid network errors
      setUser(null);
      setLoading(false);
      return;
    }

    // Handle OAuth redirect responses that contain session info in the URL.
    // Some Supabase auth flows require parsing the URL to extract the session
    // after the provider redirects back to the app. If the helper exists,
    // parse the session first, then fall back to getSession().
    (async () => {
      try {
        // If the client exposes getSessionFromUrl, use it to parse OAuth response
        if (
          supabase.auth.getSessionFromUrl &&
          /access_token|provider_token|code|session/.test(window.location.href)
        ) {
          // getSessionFromUrl returns { data, error } in supabase-js v2
          // eslint-disable-next-line no-unused-vars
          const maybe = await supabase.auth.getSessionFromUrl();
          // clean up URL to remove provider tokens for UX
          try {
            const url = new URL(window.location.href);
            url.hash = "";
            url.search = "";
            window.history.replaceState({}, document.title, url.toString());
          } catch {
            // ignore
          }
        }

        // Finally, request the current session state
        const { data: { session } = {} } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      // If a user just signed in via OAuth redirect, ensure they end up on the dashboard
      if (event === "SIGNED_IN" && session && typeof window !== "undefined") {
        // If the user is on the landing page or auth page, force a navigation to the app
        const path = window.location.pathname;
        if (path === "/" || path === "/landing" || path === "/auth") {
          window.location.replace("/dashboard");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [DISABLE_AUTH]);

  async function signIn(email, password) {
    if (DISABLE_AUTH) return { success: true, user: null };
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, user: data.user };
  }

  async function signUp(email, password) {
    if (DISABLE_AUTH) return { success: true, user: null };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { success: false, error: error.message };
    // Supabase returns a user with identities=[] when email confirmation is required
    const needsConfirmation =
      data.user && (!data.user.identities || data.user.identities.length === 0);
    if (needsConfirmation) {
      return { success: true, user: null, confirmEmail: true };
    }
    return { success: true, user: data.user, confirmEmail: !data.session };
  }

  async function signInWithGoogle() {
    if (DISABLE_AUTH) return { success: true };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async function signOut() {
    if (DISABLE_AUTH) {
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
  }

  // exposed so callers can await full sign-out before navigating
  // (navigation handled by the caller, e.g. Navbar)

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
