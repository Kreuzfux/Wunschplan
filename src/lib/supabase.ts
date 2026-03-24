import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Do not crash the entire SPA on missing build-time vars.
// This keeps GitHub Pages from showing a white screen and surfaces
// a clear config issue in the browser console instead.
const fallbackUrl = "https://example.supabase.co";
const fallbackAnonKey = "public-anon-key-placeholder";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Supabase-Konfiguration fehlt: VITE_SUPABASE_URL und/oder VITE_SUPABASE_ANON_KEY. " +
      "Prüfe GitHub Actions Secrets und baue neu.",
  );
}

export const supabase = createClient(supabaseUrl ?? fallbackUrl, supabaseAnonKey ?? fallbackAnonKey);
