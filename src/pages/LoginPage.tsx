import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

function toFriendlyLoginError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "E-Mail oder Passwort ist falsch.";
  }
  if (normalized.includes("email not confirmed")) {
    return "E-Mail-Adresse noch nicht bestaetigt. Bitte bestaetige zuerst deine E-Mail.";
  }
  if (normalized.includes("network") || normalized.includes("failed to fetch")) {
    return "Netzwerkfehler beim Login. Bitte Verbindung pruefen und erneut versuchen.";
  }
  return message;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading: authLoading } = useAuth();
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

  useEffect(() => {
    if (!authLoading && session) {
      navigate("/", { replace: true });
    }
  }, [authLoading, navigate, session]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        setError(toFriendlyLoginError(signInError.message));
        return;
      }

      // Route after sign-in; LoginPage effect handles delayed session propagation.
      navigate("/", { replace: true });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unerwarteter Fehler bei der Anmeldung.";
      setError(toFriendlyLoginError(message));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetLocalData() {
    try {
      // Never let remote sign-out block local reset/navigation.
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 1500);
        }),
      ]);
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
      const basePath = window.location.pathname.includes("/Wunschplan") ? "/Wunschplan" : "";
      window.location.replace(`${basePath}/#/login?reset=1`);
    }, 450);
  }

  useEffect(() => {
    // Emergency-only: hidden shortcut to reset local data.
    // Ctrl+Shift+Alt+R on Windows/Linux, Cmd+Shift+Alt+R on macOS.
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mainModifierOk = isMac ? e.metaKey : e.ctrlKey;
      if (!mainModifierOk || !e.shiftKey || !e.altKey) return;
      if (e.key.toLowerCase() !== "r") return;
      e.preventDefault();
      void handleResetLocalData();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="auth-shell">
      <div className="absolute right-4 top-6 z-10 md:right-8">
        <ThemeToggle />
      </div>
      <form onSubmit={handleSubmit} className="auth-card">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">Pflegedienst</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Anmeldung</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Melde dich mit deiner E-Mail und deinem Passwort an.</p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">E-Mail</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Passwort</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error ? (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {resetMessage ? (
          <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            {resetMessage}
          </p>
        ) : null}
        <button className="btn-primary w-full py-2.5" disabled={loading} type="submit">
          {loading ? "Anmeldung läuft…" : "Einloggen"}
        </button>
        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          Noch kein Konto?{" "}
          <Link className="link" to="/register">
            Registrieren
          </Link>
        </p>
      </form>
    </main>
  );
}
