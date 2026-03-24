import { useEffect, useMemo, useState } from "react";
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { Link } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { useMonthlyPlan } from "@/hooks/useMonthlyPlan";
import { supabase } from "@/lib/supabase";
import type { ShiftType } from "@/types";

interface ShiftTypeOverrideRow {
  shift_type_id: string;
  override_start_time: string;
  override_end_time: string;
}

interface DisplayShift {
  id: string;
  name: string;
  defaultStart: string;
  defaultEnd: string;
  start: string;
  end: string;
}

export function EmployeeDashboardPage() {
  const { profile, signOut } = useAuth();
  const { plan, loading } = useMonthlyPlan();
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [shifts, setShifts] = useState<DisplayShift[]>([]);
  const [selectedShiftTypeIds, setSelectedShiftTypeIds] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const days = useMemo(() => {
    if (!plan) return [];
    const first = startOfMonth(new Date(plan.year, plan.month - 1, 1));
    const last = endOfMonth(first);
    const result: Date[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) result.push(d);
    return result;
  }, [plan]);

  useEffect(() => {
    supabase
      .from("shift_types")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        const baseShifts = ((data ?? []) as ShiftType[]).filter((shift) => shift.is_active !== false);
        setShifts(
          baseShifts.map((shift) => ({
            id: shift.id,
            name: shift.name,
            defaultStart: shift.default_start_time,
            defaultEnd: shift.default_end_time,
            start: shift.default_start_time,
            end: shift.default_end_time,
          })),
        );
      });
  }, []);

  useEffect(() => {
    if (!plan || !shifts.length) return;
    supabase
      .from("shift_type_overrides")
      .select("shift_type_id,override_start_time,override_end_time")
      .eq("monthly_plan_id", plan.id)
      .then(({ data }) => {
        const overrides = (data ?? []) as ShiftTypeOverrideRow[];
        const overrideMap = new Map(overrides.map((item) => [item.shift_type_id, item]));
        setShifts((prev) =>
          prev.map((shift) => {
            const override = overrideMap.get(shift.id);
            return {
              ...shift,
              start: override?.override_start_time ?? shift.defaultStart,
              end: override?.override_end_time ?? shift.defaultEnd,
            };
          }),
        );
      });
  }, [plan, shifts.length]);

  useEffect(() => {
    if (!plan || !profile || selectedDates.length !== 1) return;
    const selectedDate = selectedDates[0];
    supabase
      .from("shift_wishes")
      .select("remarks,shift_type_id")
      .eq("monthly_plan_id", plan.id)
      .eq("employee_id", profile.id)
      .eq("date", selectedDate)
      .then(({ data }) => {
        const rows = data ?? [];
        setRemarks(rows[0]?.remarks ?? "");
        setSelectedShiftTypeIds(rows.map((row) => row.shift_type_id).filter(Boolean));
      });
  }, [plan, profile, selectedDates]);

  useEffect(() => {
    if (selectedDates.length > 1) {
      setRemarks("");
      setSelectedShiftTypeIds([]);
    }
  }, [selectedDates.length]);

  async function saveWish() {
    if (!selectedDates.length || !plan || !profile || !selectedShiftTypeIds.length) return;
    setErrorMessage(null);
    for (const selectedDate of selectedDates) {
      const { error: deleteError } = await supabase
        .from("shift_wishes")
        .delete()
        .eq("monthly_plan_id", plan.id)
        .eq("employee_id", profile.id)
        .eq("date", selectedDate);
      if (deleteError) {
        setErrorMessage(deleteError.message);
        return;
      }

      const { error: insertError } = await supabase.from("shift_wishes").insert(
        selectedShiftTypeIds.map((shiftTypeId) => ({
          monthly_plan_id: plan.id,
          employee_id: profile.id,
          date: selectedDate,
          shift_type_id: shiftTypeId,
          wish_type: "available",
          remarks,
        })),
      );
      if (insertError) {
        setErrorMessage(insertError.message);
        return;
      }
    }

    // Ensure employee appears in admin submission status as "Offen"
    // until they explicitly submit the full monthly plan.
    const { error: submissionError } = await supabase.from("wish_submissions").upsert(
      {
        monthly_plan_id: plan.id,
        employee_id: profile.id,
        is_submitted: false,
      },
      {
        onConflict: "monthly_plan_id,employee_id",
      },
    );
    if (submissionError) {
      setErrorMessage(submissionError.message);
      return;
    }

    setSavedMessage(`Wunsch für ${selectedDates.length} Tag(e) gespeichert.`);
    setTimeout(() => setSavedMessage(null), 1800);
  }

  function toggleShiftSelection(shiftTypeId: string) {
    setSelectedShiftTypeIds((prev) =>
      prev.includes(shiftTypeId) ? prev.filter((id) => id !== shiftTypeId) : [...prev, shiftTypeId],
    );
  }

  function toggleDateSelection(dateKey: string) {
    setSelectedDates((prev) =>
      prev.includes(dateKey) ? prev.filter((item) => item !== dateKey) : [...prev, dateKey],
    );
  }

  async function submitPlan() {
    if (!plan || !profile) return;
    setErrorMessage(null);
    const { error } = await supabase.from("wish_submissions").upsert(
      {
        monthly_plan_id: plan.id,
        employee_id: profile.id,
        is_submitted: true,
        submitted_at: new Date().toISOString(),
      },
      {
        onConflict: "monthly_plan_id,employee_id",
      },
    );
    if (error) {
      setErrorMessage(error.message);
      return;
    }
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
            <p className="text-sm text-slate-600">Mitarbeiter: {profile?.full_name}</p>
            <p className="text-sm text-slate-600">Tippe einen oder mehrere Tage an, um Schicht und Bemerkung zu erfassen.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-4 shadow sm:grid-cols-4 md:grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const active = selectedDates.includes(key);
              return (
                <button
                  key={key}
                  className={`rounded border p-3 text-left text-sm ${active ? "border-slate-900 bg-slate-100" : "border-slate-200"}`}
                  onClick={() => toggleDateSelection(key)}
                >
                  <div className="font-medium">{format(day, "dd.MM.")}</div>
                  <div className="text-xs text-slate-500">{format(day, "EEE", { locale: de })}</div>
                </button>
              );
            })}
          </div>

          {selectedDates.length ? (
            <div className="rounded-xl bg-white p-4 shadow">
              <h3 className="font-medium">
                Eintrag für {selectedDates.length === 1 ? format(new Date(selectedDates[0]), "PPPP", { locale: de }) : `${selectedDates.length} ausgewählte Tage`}
              </h3>
              <p className="mt-1 text-sm text-slate-600">Waehle die Schichtzeit, die der Admin freigegeben hat.</p>
              <div className="mt-3 space-y-2">
                {shifts.map((shift) => (
                  <label key={shift.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedShiftTypeIds.includes(shift.id)}
                        onChange={() => toggleShiftSelection(shift.id)}
                      />
                      {shift.name}
                    </span>
                    <span className="text-slate-600">
                      {shift.start} - {shift.end}
                    </span>
                  </label>
                ))}
              </div>
              <textarea
                aria-label="Bemerkungen"
                className="mt-3 w-full rounded border p-3"
                rows={4}
                placeholder="z. B. nur mit Führerschein"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                  disabled={!selectedShiftTypeIds.length}
                  onClick={() => void saveWish()}
                >
                  Wunsch speichern
                </button>
                <button className="rounded border px-4 py-2 text-sm" onClick={() => setSelectedDates([])}>
                  Auswahl leeren
                </button>
                <button className="rounded border px-4 py-2 text-sm" onClick={() => void submitPlan()}>
                  Wunschplan einreichen
                </button>
              </div>
              {savedMessage ? <p className="mt-2 text-sm text-green-700">{savedMessage}</p> : null}
              {errorMessage ? <p className="mt-2 text-sm text-red-700">{errorMessage}</p> : null}
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
