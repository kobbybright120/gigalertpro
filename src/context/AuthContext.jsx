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

  useEffect(() => {
    if (DISABLE_AUTH) {
      // In demo mode we skip Supabase auth calls to avoid network errors
      setUser(null);
      setLoading(false);
      return;
    }

    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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
    return { success: true, user: data.user };
  }

  async function signOut() {
    if (DISABLE_AUTH) {
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
