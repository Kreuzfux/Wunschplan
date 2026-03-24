import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <form onSubmit={handleSubmit} className="w-full space-y-4 rounded-xl bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">Registrierung</h1>
        <label className="block">
          <span className="mb-1 block text-sm">Vollständiger Name</span>
          <input className="w-full rounded border px-3 py-2" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">E-Mail</span>
          <input className="w-full rounded border px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Passwort</span>
          <input className="w-full rounded border px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hasDriversLicense} onChange={(e) => setHasDriversLicense(e.target.checked)} />
          Führerschein vorhanden
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60" disabled={loading} type="submit">
          {loading ? "Registrierung läuft..." : "Konto erstellen"}
        </button>
        <p className="text-sm">
          Bereits registriert? <Link className="text-blue-700 underline" to="/login">Zur Anmeldung</Link>
        </p>
      </form>
    </main>
  );
}
