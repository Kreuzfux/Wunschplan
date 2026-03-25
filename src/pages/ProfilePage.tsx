import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
    <main className="mx-auto max-w-2xl p-4 md:p-6">
      <header className="mb-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Link
            className="rounded border px-3 py-2 text-sm"
            to={profile && ["admin", "superuser"].includes(profile.role) ? "/admin" : "/dashboard"}
          >
            Zurück
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Profil</h1>
        <p className="text-sm text-slate-600">Hier kannst du Name, E‑Mail und dein Profilbild verwalten.</p>
      </header>

      {notice ? <p className="mb-3 rounded bg-slate-100 p-3 text-sm">{notice}</p> : null}

      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium">Stammdaten</h2>
        <div className="mt-3 space-y-3 text-sm">
          <label className="block">
            Name
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block">
            Login‑E‑Mail
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block">
            Max. Schichten pro Monat
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              type="number"
              min={0}
              max={366}
              value={maxShifts}
              onChange={(e) => setMaxShifts(e.target.value)}
              disabled={busy}
            />
            <span className="mt-1 block text-xs text-slate-600">
              Dieses Limit berücksichtigt die automatische Dienstplan-Generierung.
            </span>
          </label>
          <button
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void saveProfile()}
          >
            Speichern
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium">Profilbild</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full border bg-slate-50">
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
            <div className="mt-2 flex gap-2">
              <button className="rounded border px-3 py-1 disabled:opacity-60" disabled={busy || !avatarFile} onClick={() => void uploadAvatar()}>
                Hochladen
              </button>
              <span className="text-slate-600">Max. 5 MB (JPG/PNG/WEBP)</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

