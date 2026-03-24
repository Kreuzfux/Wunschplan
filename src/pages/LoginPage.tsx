import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (location.search.includes("reset=1")) {
      setResetMessage("Lokale Daten wurden erfolgreich zurückgesetzt.");
      navigate("/login", { replace: true });
    }
  }, [location.search, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);

      if (signInError) {
        setError(signInError.message);
        return;
      }

      // Let app-level auth routing decide destination based on role/session.
      navigate("/");
    } catch {
      setLoading(false);
      setError("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
    }
  }

  async function handleResetLocalData() {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signout errors and continue with local cleanup.
    }

    localStorage.clear();
    sessionStorage.clear();

    document.cookie.split(";").forEach((cookie) => {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.slice(0, eqPos).trim() : cookie.trim();
      if (!name) return;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/Wunschplan`;
    });

    setResetMessage("Lokale Daten werden zurückgesetzt...");
    setTimeout(() => {
      window.location.replace("/Wunschplan/#/login?reset=1");
    }, 450);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <form onSubmit={handleSubmit} className="w-full space-y-4 rounded-xl bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">Anmeldung</h1>
        <label className="block">
          <span className="mb-1 block text-sm">E-Mail</span>
          <input className="w-full rounded border px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Passwort</span>
          <input className="w-full rounded border px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {resetMessage ? <p className="text-sm text-green-700">{resetMessage}</p> : null}
        <button className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60" disabled={loading} type="submit">
          {loading ? "Anmeldung läuft..." : "Einloggen"}
        </button>
        <button className="w-full rounded border px-4 py-2 text-sm" onClick={() => void handleResetLocalData()} type="button">
          Lokale Daten zurücksetzen
        </button>
        <p className="text-sm">
          Noch kein Konto? <Link className="text-blue-700 underline" to="/register">Registrieren</Link>
        </p>
      </form>
    </main>
  );
}
