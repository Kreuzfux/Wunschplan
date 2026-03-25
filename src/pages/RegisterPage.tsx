import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/lib/supabase";

export function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hasDriversLicense, setHasDriversLicense] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          has_drivers_license: hasDriversLicense,
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    // Fallback, falls kein DB Trigger in Supabase eingerichtet ist.
    if (data.user?.id) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: "employee",
        has_drivers_license: hasDriversLicense,
      });
    }

    setLoading(false);
    navigate("/dashboard");
  }

  return (
    <main className="auth-shell">
      <div className="absolute right-4 top-6 z-10 md:right-8">
        <ThemeToggle />
      </div>
      <form onSubmit={handleSubmit} className="auth-card">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">Pflegedienst</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Registrierung</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Lege ein Konto für den Schichtplan an.</p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Vollständiger Name</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
        </label>
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
            minLength={6}
            required
            autoComplete="new-password"
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
          <input
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-500"
            type="checkbox"
            checked={hasDriversLicense}
            onChange={(e) => setHasDriversLicense(e.target.checked)}
          />
          <span>Führerschein vorhanden</span>
        </label>
        {error ? (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <button className="btn-primary w-full py-2.5" disabled={loading} type="submit">
          {loading ? "Registrierung läuft…" : "Konto erstellen"}
        </button>
        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          Bereits registriert?{" "}
          <Link className="link" to="/login">
            Zur Anmeldung
          </Link>
        </p>
      </form>
    </main>
  );
}
