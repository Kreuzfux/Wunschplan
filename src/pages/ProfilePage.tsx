import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function getFileExt(file: File) {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  const parts = file.name.split(".");
  return (parts[parts.length - 1] || "png").toLowerCase();
}

export function ProfilePage() {
  const { profile, teamSwitcherTeams } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  /** team_id -> Eingabe (nur Mitarbeiter) */
  const [limitsByTeamId, setLimitsByTeamId] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [signedAvatarUrl, setSignedAvatarUrl] = useState<string | null>(null);

  const isEmployee = profile?.role === "employee";

  const teamsForLimits = useMemo(() => teamSwitcherTeams, [teamSwitcherTeams]);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setEmail(profile?.email ?? "");
  }, [profile?.email, profile?.full_name]);

  useEffect(() => {
    async function loadLimits() {
      if (!profile?.id || !isEmployee) {
        setLimitsByTeamId({});
        return;
      }
      const { data, error } = await supabase
        .from("employee_shift_limits")
        .select("team_id,max_shifts_per_month")
        .eq("employee_id", profile.id);
      if (error) return;
      const next: Record<string, string> = {};
      for (const row of data ?? []) {
        const r = row as { team_id: string; max_shifts_per_month: number };
        next[r.team_id] = String(r.max_shifts_per_month);
      }
      setLimitsByTeamId(next);
    }
    void loadLimits();
  }, [profile?.id, isEmployee]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const avatarPathOrUrl = useMemo(() => profile?.avatar_url ?? null, [profile?.avatar_url]);

  useEffect(() => {
    async function loadSignedAvatar() {
      if (!avatarPathOrUrl) {
        setSignedAvatarUrl(null);
        return;
      }
      if (avatarPathOrUrl.startsWith("http://") || avatarPathOrUrl.startsWith("https://")) {
        setSignedAvatarUrl(avatarPathOrUrl);
        return;
      }
      const { data, error } = await supabase.storage.from("avatars").createSignedUrl(avatarPathOrUrl, 60 * 60);
      if (error) {
        setSignedAvatarUrl(null);
        return;
      }
      setSignedAvatarUrl(data?.signedUrl ?? null);
    }
    void loadSignedAvatar();
  }, [avatarPathOrUrl]);

  async function saveShiftLimitsForTeams(): Promise<boolean> {
    if (!profile?.id || !isEmployee || !teamsForLimits.length) return true;

    const rows: { employee_id: string; team_id: string; max_shifts_per_month: number }[] = [];
    for (const t of teamsForLimits) {
      const raw = (limitsByTeamId[t.id] ?? "31").trim();
      const n = raw === "" ? 31 : Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0 || n > 366) {
        setNotice(`Max. Schichten für „${t.name}“: bitte Zahl zwischen 0 und 366 (leer = 31).`);
        return false;
      }
      rows.push({ employee_id: profile.id, team_id: t.id, max_shifts_per_month: n });
    }

    if (!rows.length) return true;

    const { error: limitError } = await supabase
      .from("employee_shift_limits")
      .upsert(rows, { onConflict: "employee_id,team_id" });
    if (limitError) {
      setNotice(limitError.message);
      return false;
    }
    return true;
  }

  async function saveProfile() {
    if (!profile) return;
    const nextName = fullName.trim();
    const nextEmail = email.trim().toLowerCase();
    if (!nextName) {
      setNotice("Bitte einen Namen eingeben.");
      return;
    }
    if (!nextEmail.includes("@")) {
      setNotice("Bitte eine gültige E‑Mail eingeben.");
      return;
    }
    setBusy(true);
    setNotice(null);

    const { error: profileError } = await supabase.from("profiles").update({ full_name: nextName }).eq("id", profile.id);
    if (profileError) {
      setNotice(profileError.message);
      setBusy(false);
      return;
    }

    if (isEmployee) {
      const limitsOk = await saveShiftLimitsForTeams();
      if (!limitsOk) {
        setBusy(false);
        return;
      }
    }

    if (nextEmail !== (profile.email ?? "").toLowerCase()) {
      const { error: authError } = await supabase.auth.updateUser({ email: nextEmail });
      if (authError) {
        setNotice(authError.message);
        setBusy(false);
        return;
      }
      setNotice("E‑Mail-Änderung angestoßen. Bitte Bestätigungs‑E‑Mail prüfen.");
    } else {
      setNotice(isEmployee ? "Profil und Schichtlimits gespeichert." : "Profil gespeichert.");
    }

    setBusy(false);
  }

  async function uploadAvatar() {
    if (!profile || !avatarFile) return;
    if (avatarFile.size > MAX_AVATAR_BYTES) {
      setNotice("Profilbild ist zu groß (max. 5 MB).");
      return;
    }
    if (!ALLOWED_TYPES.includes(avatarFile.type)) {
      setNotice("Bitte JPG, PNG oder WEBP hochladen.");
      return;
    }
    setBusy(true);
    setNotice(null);

    const ext = getFileExt(avatarFile);
    const path = `${profile.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, { upsert: true, cacheControl: "3600" });
    if (uploadError) {
      setNotice(uploadError.message);
      setBusy(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: path, avatar_updated_at: new Date().toISOString() })
      .eq("id", profile.id);
    if (updateError) {
      setNotice(updateError.message);
      setBusy(false);
      return;
    }

    setAvatarFile(null);
    setNotice("Profilbild aktualisiert.");
    setBusy(false);
  }

  return (
    <main className="page-shell max-w-2xl">
      <header className="page-header">
        <div className="flex w-full flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                className="btn-secondary"
                to={profile && ["admin", "superuser"].includes(profile.role) ? "/admin" : "/dashboard"}
              >
                Zurück
              </Link>
              <TeamSwitcher />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Profil</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Hier kannst du Name, E‑Mail und dein Profilbild verwalten.</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {notice ? (
        <p className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
          {notice}
        </p>
      ) : null}

      <section className="card p-5 md:p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Stammdaten</h2>
        <div className="mt-4 space-y-4 text-sm">
          <label className="block">
            <span className="mb-1.5 block font-medium text-slate-700 dark:text-slate-300">Name</span>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-medium text-slate-700 dark:text-slate-300">Login‑E‑Mail</span>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              autoComplete="email"
            />
          </label>
          <button className="btn-primary" type="button" disabled={busy} onClick={() => void saveProfile()}>
            Speichern
          </button>
        </div>
      </section>

      {isEmployee ? (
        <section className="card mt-6 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Schichtlimits pro Team</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Die automatische Dienstplan-Generierung berücksichtigt pro Kalendermonat höchstens so viele Schichten – je Team,
            in dem du eingeteilt bist.
          </p>
          {!teamsForLimits.length ? (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Du bist aktuell keinem Team zugeordnet.</p>
          ) : (
            <div className="mt-4 space-y-4 text-sm">
              {teamsForLimits.map((t) => (
                <label key={t.id} className="block">
                  <span className="mb-1.5 block font-medium text-slate-700 dark:text-slate-300">Max. Schichten / Monat – {t.name}</span>
                  <input
                    className="input max-w-[12rem]"
                    type="number"
                    min={0}
                    max={366}
                    value={limitsByTeamId[t.id] ?? "31"}
                    onChange={(e) =>
                      setLimitsByTeamId((prev) => ({
                        ...prev,
                        [t.id]: e.target.value,
                      }))
                    }
                    disabled={busy}
                  />
                </label>
              ))}
              <p className="text-xs text-slate-600 dark:text-slate-400">Wird mit „Speichern“ unter Stammdaten übernommen.</p>
            </div>
          )}
        </section>
      ) : null}

      <section className="card mt-6 p-5 md:p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Profilbild</h2>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-slate-200 bg-gradient-to-br from-slate-100 to-brand-50 shadow-inner dark:border-slate-600 dark:from-slate-800 dark:to-brand-950/50">
            {avatarPreviewUrl ? (
              <img className="h-full w-full object-cover" src={avatarPreviewUrl} alt="Vorschau Profilbild" />
            ) : signedAvatarUrl ? (
              <img className="h-full w-full object-cover" src={signedAvatarUrl} alt="Profilbild" />
            ) : null}
          </div>
          <div className="text-sm">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="btn-secondary btn-sm"
                type="button"
                disabled={busy || !avatarFile}
                onClick={() => void uploadAvatar()}
              >
                Hochladen
              </button>
              <span className="text-xs text-slate-600 dark:text-slate-400">Max. 5 MB (JPG/PNG/WEBP)</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
