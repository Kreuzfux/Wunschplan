import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () ***REMOVED*** Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() ***REMOVED*** {
    supabase.auth.getSession().then(async ({ data }) ***REMOVED*** {
      setSession(data.session);
      if (data.session?.user.id) {
        const { data: profileData } = await supabase.from("profiles").select("*").eq("id", data.session.user.id).single();
        setProfile(profileData ?? null);
      }
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange(async (_, newSession) ***REMOVED*** {
      setSession(newSession);
      if (newSession?.user.id) {
        const { data: profileData } = await supabase.from("profiles").select("*").eq("id", newSession.user.id).single();
        setProfile(profileData ?? null);
      } else {
        setProfile(null);
      }
    });

    return () ***REMOVED*** data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () ***REMOVED*** ({
      session,
      profile,
      loading,
      signOut: async () ***REMOVED*** {
        await supabase.auth.signOut();
      },
    }),
    [loading, profile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth muss innerhalb von AuthProvider verwendet werden.");
  }
  return ctx;
}
