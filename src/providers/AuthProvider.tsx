import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

interface TeamOption {
  id: string;
  name: string;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Aktives Team: `active_team_id` oder Fallback `team_id`. */
  effectiveTeamId: string | null;
  /** Teams der aktuellen Person (für Umschalter). */
  teamSwitcherTeams: TeamOption[];
  setActiveTeam: (teamId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const ADMIN_EMAIL = "nitzschkepa@yahoo.de";
const ADMIN_USER_ID = "b6210438-2ad6-4387-b4d6-99ba8f87cd76";
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
      session.user.id === ADMIN_USER_ID || email.toLowerCase() === ADMIN_EMAIL
        ? "admin"
        : "employee",
    team_id: null,
    active_team_id: null,
    has_drivers_license: Boolean(session.user.user_metadata?.has_drivers_license),
    is_active: true,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamSwitcherTeams, setTeamSwitcherTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTeamSwitcherTeams = useCallback(async (userId: string) => {
    const { data: mems, error } = await supabase.from("team_memberships").select("team_id").eq("user_id", userId);
    if (error || !mems?.length) {
      setTeamSwitcherTeams([]);
      return;
    }
    const ids = Array.from(new Set(mems.map((m: { team_id: string }) => m.team_id)));
    const { data: teamRows } = await supabase
      .from("teams")
      .select("id,name")
      .in("id", ids)
      .eq("is_active", true)
      .order("name");
    setTeamSwitcherTeams((teamRows ?? []) as TeamOption[]);
  }, []);

  const setActiveTeam = useCallback(
    async (teamId: string) => {
      if (!session?.user.id) return;
      const { error } = await supabase.from("profiles").update({ active_team_id: teamId }).eq("id", session.user.id);
      if (error) return;
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      setProfile(profileData ?? null);
      await loadTeamSwitcherTeams(session.user.id);
    },
    [loadTeamSwitcherTeams, session?.user.id],
  );

  async function ensureProfileEmailMatchesAuth(userId: string, authEmail: string | null | undefined) {
    const normalizedAuthEmail = (authEmail ?? "").trim();
    if (!normalizedAuthEmail) return;
    const { data: profileRow } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
    const currentProfileEmail = String((profileRow as any)?.email ?? "").trim();
    if (!currentProfileEmail) return;
    if (currentProfileEmail.toLowerCase() === normalizedAuthEmail.toLowerCase()) return;
    // Best-effort sync, ignore errors (RLS may block in some edge cases).
    await supabase.from("profiles").update({ email: normalizedAuthEmail }).eq("id", userId);
  }

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
        setTeamSwitcherTeams([]);
        setLoading(false);
        return;
          }
        }

        setSession(initialSession);
        if (initialSession?.user.id) {
          await ensureProfileEmailMatchesAuth(initialSession.user.id, initialSession.user.email);
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", initialSession.user.id)
            .maybeSingle();
          const nextProfile = profileData ?? buildFallbackProfile(initialSession);
          setProfile(nextProfile);
          await loadTeamSwitcherTeams(initialSession.user.id);
        } else {
          setProfile(null);
          setTeamSwitcherTeams([]);
        }
      } catch {
        await supabase.auth.signOut({ scope: "local" });
        clearSupabaseAuthStorage();
        setSession(null);
        setProfile(null);
        setTeamSwitcherTeams([]);
      } finally {
        setLoading(false);
      }
    }

    void initializeAuth();

    const { data } = supabase.auth.onAuthStateChange(async (_, newSession) => {
      setSession(newSession);
      if (newSession?.user.id) {
        await ensureProfileEmailMatchesAuth(newSession.user.id, newSession.user.email);
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", newSession.user.id)
          .maybeSingle();
        const nextProfile = profileData ?? buildFallbackProfile(newSession);
        setProfile(nextProfile);
        await loadTeamSwitcherTeams(newSession.user.id);
      } else {
        setProfile(null);
        setTeamSwitcherTeams([]);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const effectiveTeamId = useMemo(() => {
    if (!profile) return null;
    return profile.active_team_id ?? profile.team_id ?? null;
  }, [profile?.active_team_id, profile?.team_id, profile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      effectiveTeamId,
      teamSwitcherTeams,
      setActiveTeam,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [effectiveTeamId, loading, profile, session, setActiveTeam, teamSwitcherTeams],
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
