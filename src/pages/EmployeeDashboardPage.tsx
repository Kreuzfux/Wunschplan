import { useEffect, useMemo, useState } from "react";
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { Link } from "react-router-dom";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/providers/AuthProvider";
import { useMonthlyPlans } from "@/hooks/useMonthlyPlan";
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

interface ScheduleAssignmentRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_type_id: string | null;
}

export function EmployeeDashboardPage() {
  const { profile, signOut, effectiveTeamId } = useAuth();
  const { plans, selectedPlanId, setSelectedPlanId, plan, loading } = useMonthlyPlans(effectiveTeamId);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [shifts, setShifts] = useState<DisplayShift[]>([]);
  const [assignments, setAssignments] = useState<ScheduleAssignmentRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
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
    if (!effectiveTeamId) return;
    supabase
      .from("shift_types")
      .select("*")
      .eq("team_id", effectiveTeamId)
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
  }, [effectiveTeamId]);

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
    setSelectedDates([]);
    setSelectedShiftTypeIds([]);
    setRemarks("");
    setSavedMessage(null);
    setErrorMessage(null);
  }, [plan?.id]);

  useEffect(() => {
    async function loadAssignments() {
      if (!plan || !profile) return;
      if (plan.status !== "published") {
        setAssignments([]);
        return;
      }
      setAssignmentsLoading(true);
      const { data, error } = await supabase
        .from("schedule_assignments")
        .select("id,date,start_time,end_time,shift_type_id")
        .eq("monthly_plan_id", plan.id)
        .eq("employee_id", profile.id)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) {
        setErrorMessage(error.message);
        setAssignments([]);
      } else {
        setAssignments((data ?? []) as ScheduleAssignmentRow[]);
      }
      setAssignmentsLoading(false);
    }
    void loadAssignments();
  }, [plan?.id, plan?.status, profile?.id]);

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

  if (loading)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <div className="spinner" aria-hidden />
        <p className="text-sm text-slate-600 dark:text-slate-400">Monatsdaten werden geladen…</p>
      </div>
    );

  return (
    <main className="page-shell max-w-6xl">
      <header className="page-header">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">Schichtplan</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Mitarbeiter-Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Willkommen, {profile?.full_name}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ThemeToggle />
          <TeamSwitcher />
          <Link className="btn-secondary" to="/chat">
            Chat
          </Link>
          <Link className="btn-secondary" to="/profil">
            Profil
          </Link>
          {profile && ["admin", "superuser"].includes(profile.role) ? (
            <Link className="btn-secondary" to="/admin">
              Zum Adminbereich
            </Link>
          ) : null}
          <button className="btn-secondary" type="button" onClick={() => void signOut()}>
            Ausloggen
          </button>
        </div>
      </header>

      {!plan ? (
        <section className="card p-6 text-slate-700 dark:text-slate-300">
          Aktuell sind keine Monate für dein Team vorhanden.
        </section>
      ) : (
        <section className="space-y-4">
          <div className="card p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Monat {format(new Date(plan.year, plan.month - 1, 1), "MMMM yyyy", { locale: de })}
              </h2>
              <span className="badge capitalize">{plan.status}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">Monat auswählen</span>
                <select
                  className="select min-w-[12rem]"
                  value={selectedPlanId ?? ""}
                  onChange={(e) => setSelectedPlanId(e.target.value || null)}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {format(new Date(p.year, p.month - 1, 1), "MMMM yyyy", { locale: de })} ({p.status})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Mitarbeiter: {profile?.full_name}</p>
            {plan.status === "open" ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">Tippe einen oder mehrere Tage an, um Schicht und Bemerkung zu erfassen.</p>
            ) : plan.status === "published" ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">Der Monat ist veröffentlicht. Unten siehst du deinen Dienstplan.</p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Für diesen Monat ist aktuell keine Wunschplanung möglich. Bitte wähle einen offenen Monat oder
                schaue in einen veröffentlichten Monat.
              </p>
            )}
          </div>

          {plan.status === "open" ? (
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-soft dark:border-slate-700/80 dark:bg-slate-900/50 dark:shadow-soft-dark sm:grid-cols-4 md:grid-cols-7">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const active = selectedDates.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                      active
                        ? "border-brand-500 bg-brand-50 text-brand-950 shadow-sm dark:border-brand-500 dark:bg-brand-900 dark:text-white dark:shadow-md"
                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                    }`}
                    onClick={() => toggleDateSelection(key)}
                  >
                    <div className="font-semibold text-inherit">{format(day, "dd.MM.")}</div>
                    <div
                      className={
                        active
                          ? "text-xs text-slate-600 dark:text-brand-200"
                          : "text-xs text-slate-500 dark:text-slate-400"
                      }
                    >
                      {format(day, "EEE", { locale: de })}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : plan.status === "published" ? (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50">Dein Dienstplan</h3>
              {assignmentsLoading ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Dienstplan wird geladen...</p>
              ) : assignments.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {assignments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2.5 dark:border-slate-600/80 dark:bg-slate-800/60"
                    >
                      <span className="font-medium text-slate-700 dark:text-slate-200">{format(new Date(a.date), "EEE, dd.MM.", { locale: de })}</span>
                      <span className="tabular-nums text-slate-800 dark:text-slate-100">
                        {a.start_time} – {a.end_time}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Für dich sind noch keine Schichten zugeteilt.</p>
              )}
              {errorMessage ? (
                <p className="mt-2 text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
              ) : null}
            </div>
          ) : (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50">Monat ansehen</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Status „{plan.status}“: In diesem Zustand gibt es hier keine Mitarbeiter-Aktion.
              </p>
            </div>
          )}

          {plan.status === "open" && selectedDates.length ? (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50">
                Eintrag für {selectedDates.length === 1 ? format(new Date(selectedDates[0]), "PPPP", { locale: de }) : `${selectedDates.length} ausgewählte Tage`}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Waehle die Schichtzeit, die der Admin freigegeben hat.</p>
              <div className="mt-3 space-y-2">
                {shifts.map((shift) => (
                  <label
                    key={shift.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm transition-colors hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-slate-500"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-500"
                        type="checkbox"
                        checked={selectedShiftTypeIds.includes(shift.id)}
                        onChange={() => toggleShiftSelection(shift.id)}
                      />
                      <span className="font-medium text-slate-800 dark:text-slate-100">{shift.name}</span>
                    </span>
                    <span className="tabular-nums text-slate-600 dark:text-slate-400">
                      {shift.start} – {shift.end}
                    </span>
                  </label>
                ))}
              </div>
              <textarea
                aria-label="Bemerkungen"
                className="input mt-3 min-h-[6rem] resize-y"
                rows={4}
                placeholder="z. B. nur mit Führerschein"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  type="button"
                  disabled={!selectedShiftTypeIds.length}
                  onClick={() => void saveWish()}
                >
                  Wunsch speichern
                </button>
                <button className="btn-secondary" type="button" onClick={() => setSelectedDates([])}>
                  Auswahl leeren
                </button>
                <button className="btn-secondary" type="button" onClick={() => void submitPlan()}>
                  Wunschplan einreichen
                </button>
              </div>
              {savedMessage ? (
                <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {savedMessage}
                </p>
              ) : null}
              {errorMessage ? (
                <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                  {errorMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
