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
  const { profile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [maxShifts, setMaxShifts] = useState<string>("31");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [signedAvatarUrl, setSignedAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setEmail(profile?.email ?? "");
  }, [profile?.email, profile?.full_name]);

  useEffect(() => {
    async function loadLimit() {
      if (!profile?.id) return;
      const { data, error } = await supabase
        .from("employee_shift_limits")
        .select("max_shifts_per_month")
        .eq("employee_id", profile.id)
        .maybeSingle();
      if (error) return;
      const value = (data as any)?.max_shifts_per_month;
      if (typeof value === "number") setMaxShifts(String(value));
    }
    void loadLimit();
  }, [profile?.id]);

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
      // Backwards compatibility: if old value is a URL, keep using it.
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

    // 1) Update display name in public profile.
    const { error: profileError } = await supabase.from("profiles").update({ full_name: nextName }).eq("id", profile.id);
    if (profileError) {
      setNotice(profileError.message);
      setBusy(false);
      return;
    }

    // 1b) Update max shifts (employee-controlled limit for generation).
    const parsedLimit = Number.parseInt(maxShifts.trim() || "31", 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 0 || parsedLimit > 366) {
      setNotice("Max. Schichten/Monat: bitte Zahl zwischen 0 und 366 eingeben.");
      setBusy(false);
      return;
    }
    const { error: limitError } = await supabase
      .from("employee_shift_limits")
      .upsert({ employee_id: profile.id, max_shifts_per_month: parsedLimit }, { onConflict: "employee_id" });
    if (limitError) {
      setNotice(limitError.message);
      setBusy(false);
      return;
    }

    // 2) Update auth login email (requires confirmation, depending on project settings).
    if (nextEmail !== (profile.email ?? "").toLowerCase()) {
      const { error: authError } = await supabase.auth.updateUser({ email: nextEmail });
      if (authError) {
        setNotice(authError.message);
        setBusy(false);
        return;
      }
      setNotice("E‑Mail-Änderung angestoßen. Bitte Bestätigungs‑E‑Mail prüfen.");
    } else {
      setNotice("Profil gespeichert.");
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
          <label className="block">
            <span className="mb-1.5 block font-medium text-slate-700 dark:text-slate-300">Max. Schichten pro Monat</span>
            <input
              className="input max-w-[12rem]"
              type="number"
              min={0}
              max={366}
              value={maxShifts}
              onChange={(e) => setMaxShifts(e.target.value)}
              disabled={busy}
            />
            <span className="mt-1.5 block text-xs text-slate-600 dark:text-slate-400">
              Dieses Limit berücksichtigt die automatische Dienstplan-Generierung.
            </span>
          </label>
          <button className="btn-primary" type="button" disabled={busy} onClick={() => void saveProfile()}>
            Speichern
          </button>
        </div>
      </section>

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

