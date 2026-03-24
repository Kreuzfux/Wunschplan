import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const SUPERUSER_EMAIL = "nitzschkepa@yahoo.de";
const SUPERUSER_USER_ID = "b6210438-2ad6-4387-b4d6-99ba8f87cd76";
const SUPABASE_PROJECT_REF = "qfmffiybblqrejilwsng";

function clearSupabaseAuthStorage() {
  const authKeyParts = ["supabase.auth.token", SUPABASE_PROJECT_REF, "sb-"];
  const clearFromStorage = (storage: Storage) => {
    Object.keys(storage).forEach((key) => {
      if (authKeyParts.some((part) => key.includes(part))) {
        storage.removeItem(key);
      }
    });
  };

  clearFromStorage(localStorage);
  clearFromStorage(sessionStorage);
}

function buildFallbackProfile(session: Session): Profile {
  const email = session.user.email ?? "";
  const fullName =
    (session.user.user_metadata?.full_name as string | undefined) ??
    (email ? email.split("@")[0] : "Benutzer");
  return {
    id: session.user.id,
    email,
    full_name: fullName,
    role:
      session.user.id === SUPERUSER_USER_ID || email.toLowerCase() === SUPERUSER_EMAIL
        ? "superuser"
        : "employee",
    team_id: null,
    has_drivers_license: Boolean(session.user.user_metadata?.has_drivers_license),
    is_active: true,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initializeAuth() {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (initialSession) {
          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser();
          if (userError || !user) {
            await supabase.auth.signOut({ scope: "local" });
            clearSupabaseAuthStorage();
            setSession(null);
            setProfile(null);
            setLoading(false);
            return;
          }
        }

        setSession(initialSession);
        if (initialSession?.user.id) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", initialSession.user.id)
            .maybeSingle();
          setProfile(profileData ?? buildFallbackProfile(initialSession));
        } else {
          setProfile(null);
        }
      } catch {
        await supabase.auth.signOut({ scope: "local" });
        clearSupabaseAuthStorage();
        setSession(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    }

    void initializeAuth();

    const { data } = supabase.auth.onAuthStateChange(async (_, newSession) => {
      setSession(newSession);
      if (newSession?.user.id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", newSession.user.id)
          .maybeSingle();
        setProfile(profileData ?? buildFallbackProfile(newSession));
      } else {
        setProfile(null);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      signOut: async () => {
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
