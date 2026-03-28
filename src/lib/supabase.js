import { createClient } from "@supabase/supabase-js";

// For MVP, we use placeholder Supabase credentials.
// Replace these with your actual Supabase project URL and anon key.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
