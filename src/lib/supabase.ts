import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseUrl = rawSupabaseUrl?.trim();
const supabaseAnonKey = rawSupabaseAnonKey?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase-Konfiguration fehlt: VITE_SUPABASE_URL und/oder VITE_SUPABASE_ANON_KEY. " +
      "Bitte GitHub Actions Secrets prüfen und neu deployen.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
