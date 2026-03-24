import { useEffect, useMemo, useState } from "react";
import { addDays, endOfMonth, format, isSameMonth, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { Link } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { useMonthlyPlan } from "@/hooks/useMonthlyPlan";
import { supabase } from "@/lib/supabase";

export function EmployeeDashboardPage() {
  const { profile, signOut } = useAuth();
  const { plan, loading } = useMonthlyPlan();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const days = useMemo(() => {
    if (!plan) return [];
    const first = startOfMonth(new Date(plan.year, plan.month - 1, 1));
    const last = endOfMonth(first);
    const result: Date[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) result.push(d);
    return result;
  }, [plan]);

  useEffect(() => {
    if (!selectedDate || !plan || !profile) return;
    supabase
      .from("shift_wishes")
      .select("remarks")
      .eq("monthly_plan_id", plan.id)
      .eq("employee_id", profile.id)
      .eq("date", selectedDate)
      .maybeSingle()
      .then(({ data }) => setRemarks(data?.remarks ?? ""));
  }, [plan, profile, selectedDate]);

  async function saveWish() {
    if (!selectedDate || !plan || !profile) return;
    await supabase.from("shift_wishes").upsert({
      monthly_plan_id: plan.id,
      employee_id: profile.id,
      date: selectedDate,
      wish_type: "available",
      remarks,
    });
    setSavedMessage("Wunsch gespeichert.");
    setTimeout(() => setSavedMessage(null), 1800);
  }

  async function submitPlan() {
    if (!plan || !profile) return;
    await supabase.from("wish_submissions").upsert({
      monthly_plan_id: plan.id,
      employee_id: profile.id,
      is_submitted: true,
      submitted_at: new Date().toISOString(),
    });
    setSavedMessage("Wunschplan erfolgreich eingereicht.");
  }

  if (loading) return <div className="p-6">Monatsdaten werden geladen...</div>;

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mitarbeiter-Dashboard</h1>
          <p className="text-sm text-slate-600">Willkommen, {profile?.full_name}</p>
        </div>
        <div className="flex items-center gap-2">
          {profile?.role === "admin" ? (
            <Link className="rounded border px-3 py-2 text-sm" to="/admin">
              Zum Adminbereich
            </Link>
          ) : null}
          <button className="rounded border px-3 py-2 text-sm" onClick={() => void signOut()}>
            Ausloggen
          </button>
        </div>
      </header>

      {!plan ? (
        <section className="rounded-xl bg-white p-6 shadow">Aktuell ist kein offener Monatsplan vorhanden.</section>
      ) : (
        <section className="space-y-4">
          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="text-lg font-medium">
              Wunschplanung {format(new Date(plan.year, plan.month - 1, 1), "MMMM yyyy", { locale: de })}
            </h2>
            <p className="text-sm text-slate-600">Tippe einen Tag an, um Wunschdienst und Bemerkung zu erfassen.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-4 shadow sm:grid-cols-4 md:grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const active = selectedDate === key;
              return (
                <button
                  key={key}
                  className={`rounded border p-3 text-left text-sm ${active ? "border-slate-900 bg-slate-100" : "border-slate-200"}`}
                  onClick={() => setSelectedDate(key)}
                >
                  <div className="font-medium">{format(day, "dd.MM.")}</div>
                  <div className="text-xs text-slate-500">{format(day, "EEE", { locale: de })}</div>
                </button>
              );
            })}
          </div>

          {selectedDate && isSameMonth(new Date(selectedDate), new Date(plan.year, plan.month - 1, 1)) ? (
            <div className="rounded-xl bg-white p-4 shadow">
              <h3 className="font-medium">Eintrag für {format(new Date(selectedDate), "PPPP", { locale: de })}</h3>
              <p className="mt-1 text-sm text-slate-600">Schichtslots können im Adminbereich angepasst werden.</p>
              <textarea
                aria-label="Bemerkungen"
                className="mt-3 w-full rounded border p-3"
                rows={4}
                placeholder="z. B. nur mit Führerschein"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
              <div className="mt-3 flex gap-2">
                <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => void saveWish()}>
                  Wunsch speichern
                </button>
                <button className="rounded border px-4 py-2 text-sm" onClick={() => void submitPlan()}>
                  Wunschplan einreichen
                </button>
              </div>
              {savedMessage ? <p className="mt-2 text-sm text-green-700">{savedMessage}</p> : null}
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
