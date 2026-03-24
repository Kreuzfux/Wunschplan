import { useEffect, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import type { MonthlyPlan, ShiftType } from "@/types";
import { exportSchedulePdf } from "@/utils/pdfExport";
import { exportScheduleExcel } from "@/utils/excelExport";
import { useAuth } from "@/providers/AuthProvider";

interface SubmissionRow {
  employee_id: string;
  is_submitted: boolean;
  profiles?: Array<{
    full_name: string;
  }> | null;
}

interface ShiftTypeOverrideRow {
  shift_type_id: string;
  override_start_time: string;
  override_end_time: string;
}

interface EditableShiftTime {
  shiftTypeId: string;
  name: string;
  start: string;
  end: string;
}

const MONTH_OPTIONS = [
  { value: 1, label: "Januar" },
  { value: 2, label: "Februar" },
  { value: 3, label: "Maerz" },
  { value: 4, label: "April" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Juni" },
  { value: 7, label: "Juli" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "Oktober" },
  { value: 11, label: "November" },
  { value: 12, label: "Dezember" },
];

export function AdminDashboardPage() {
  const { signOut } = useAuth();
  const now = new Date();
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [shifts, setShifts] = useState<ShiftType[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [shiftEditorPlanId, setShiftEditorPlanId] = useState<string | null>(null);
  const [editableShiftTimes, setEditableShiftTimes] = useState<EditableShiftTime[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [planMonth, setPlanMonth] = useState(now.getMonth() + 1);
  const [planYear, setPlanYear] = useState(now.getFullYear());
  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() + i);
  const activeShifts = shifts.filter((shift) => shift.is_active !== false);

  async function reloadPlans() {
    const { data } = await supabase
      .from("monthly_plans")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    setPlans(data ?? []);
  }

  async function reloadShifts() {
    const { data } = await supabase.from("shift_types").select("*").order("sort_order");
    setShifts(data ?? []);
  }

  async function reloadSubmissions(planId: string) {
    const { data } = await supabase
      .from("wish_submissions")
      .select("employee_id,is_submitted,profiles!wish_submissions_employee_id_fkey(full_name)")
      .eq("monthly_plan_id", planId);
    setSubmissions((data ?? []) as SubmissionRow[]);
  }

  useEffect(() => {
    void reloadPlans();
    void reloadShifts();
  }, []);

  useEffect(() => {
    if (!plans.length) return;
    if (!selectedPlanId) setSelectedPlanId(plans[0].id);
    if (!shiftEditorPlanId) setShiftEditorPlanId(plans[0].id);
  }, [plans, selectedPlanId, shiftEditorPlanId]);

  useEffect(() => {
    if (!selectedPlanId) return;
    void reloadSubmissions(selectedPlanId);

    const channel = supabase
      .channel(`wish-submissions-${selectedPlanId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wish_submissions",
          filter: `monthly_plan_id=eq.${selectedPlanId}`,
        },
        () => {
          void reloadSubmissions(selectedPlanId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedPlanId]);

  useEffect(() => {
    if (!shiftEditorPlanId || !shifts.length) {
      setEditableShiftTimes([]);
      return;
    }

    supabase
      .from("shift_type_overrides")
      .select("shift_type_id,override_start_time,override_end_time")
      .eq("monthly_plan_id", shiftEditorPlanId)
      .then(({ data }) => {
        const overrides = (data ?? []) as ShiftTypeOverrideRow[];
        const overrideMap = new Map(overrides.map((item) => [item.shift_type_id, item]));
        setEditableShiftTimes(
          shifts
            .filter((shift) => shift.is_active !== false)
            .map((shift) => {
            const override = overrideMap.get(shift.id);
            return {
              shiftTypeId: shift.id,
              name: shift.name,
              start: override?.override_start_time ?? shift.default_start_time,
              end: override?.override_end_time ?? shift.default_end_time,
            };
            }),
        );
      });
  }, [shiftEditorPlanId, shifts]);

  async function createSelectedMonthPlan() {
    if (!Number.isInteger(planMonth) || planMonth < 1 || planMonth > 12 || !Number.isInteger(planYear)) {
      setNotice("Bitte gueltigen Monat (1-12) und ein gueltiges Jahr eingeben.");
      return;
    }

    const requestedDate = new Date(planYear, planMonth - 1, 1);
    const firstCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    if (requestedDate < firstCurrentMonth) {
      setNotice("Vergangene Monate koennen nicht neu angelegt werden.");
      return;
    }

    const { error } = await supabase.from("monthly_plans").upsert({
      year: planYear,
      month: planMonth,
      status: "draft",
      min_staff_per_shift: 1,
    });
    setNotice(error ? error.message : `Monatsplan ${planMonth}.${planYear} erstellt/aktualisiert.`);
    if (!error) await reloadPlans();
  }

  async function updatePlanStatus(id: string, status: MonthlyPlan["status"]) {
    const { error } = await supabase.from("monthly_plans").update({ status }).eq("id", id);
    setNotice(error ? error.message : `Status auf '${status}' gesetzt.`);
    if (!error) await reloadPlans();
  }

  async function triggerGeneration(planId: string) {
    const { error } = await supabase.functions.invoke("generate-schedule", {
      body: { monthly_plan_id: planId },
    });
    if (error) {
      const normalized = error.message.toLowerCase();
      if (normalized.includes("failed to send a request")) {
        setNotice("Edge Function nicht erreichbar. Bitte Deployment und CORS der Funktion 'generate-schedule' pruefen.");
      } else {
        setNotice(error.message);
      }
      return;
    }
    setNotice("Dienstplan-Generierung gestartet.");
  }

  async function handleExport(planId: string) {
    const { data } = await supabase
      .from("schedule_assignments")
      .select("date,start_time,end_time,profiles!schedule_assignments_employee_id_fkey(full_name)")
      .eq("monthly_plan_id", planId);

    const rows = (data ?? []).map((entry: any) => [
      entry.date,
      `${entry.start_time}-${entry.end_time}`,
      entry.profiles?.full_name ?? "Unbekannt",
    ]) as Array<[string, string, string]>;

    const title = `Dienstplan ${format(new Date(), "MMMM yyyy", { locale: de })}`;
    exportSchedulePdf(title, rows);
    await exportScheduleExcel(title, rows);
  }

  function updateEditableShiftTime(shiftTypeId: string, field: "start" | "end", value: string) {
    setEditableShiftTimes((prev) =>
      prev.map((item) => (item.shiftTypeId === shiftTypeId ? { ...item, [field]: value } : item)),
    );
  }

  async function saveShiftTimeOverride(item: EditableShiftTime) {
    if (!shiftEditorPlanId) return;
    const { error } = await supabase.from("shift_type_overrides").upsert({
      monthly_plan_id: shiftEditorPlanId,
      shift_type_id: item.shiftTypeId,
      override_start_time: item.start,
      override_end_time: item.end,
    });
    setNotice(error ? error.message : `Schichtzeit fuer '${item.name}' gespeichert.`);
  }

  async function deleteShiftType(shiftTypeId: string, shiftName: string) {
    const { error } = await supabase.from("shift_types").update({ is_active: false }).eq("id", shiftTypeId);
    setNotice(error ? error.message : `Schicht '${shiftName}' wurde geloescht.`);
    if (!error) {
      await reloadShifts();
    }
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Admin-Bereich</h1>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => void signOut()}>
          Ausloggen
        </button>
      </header>

      {notice ? <p className="mb-3 rounded bg-slate-100 p-3 text-sm">{notice}</p> : null}

      <section className="mb-4 rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium">Monatsplanung</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Monat
            <select
              className="ml-2 rounded border px-2 py-1"
              value={planMonth}
              onChange={(e) => setPlanMonth(Number(e.target.value))}
            >
              {MONTH_OPTIONS.map((monthOption) => (
                <option key={monthOption.value} value={monthOption.value}>
                  {monthOption.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Jahr
            <select
              className="ml-2 rounded border px-2 py-1"
              value={planYear}
              onChange={(e) => setPlanYear(Number(e.target.value))}
            >
              {yearOptions.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => void createSelectedMonthPlan()}>
            Monat anlegen
          </button>
        </div>
        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">Monat</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-b">
                  <td className="p-2">{`${plan.month}.${plan.year}`}</td>
                  <td className="p-2">{plan.status}</td>
                  <td className="flex flex-wrap gap-2 p-2">
                    <button
                      className="rounded border px-2 py-1 transition-colors hover:bg-slate-100"
                      title="Setzt den Monat auf 'open', damit Mitarbeiter ihre Wuensche eintragen koennen."
                      onClick={() => void updatePlanStatus(plan.id, "open")}
                    >
                      Open
                    </button>
                    <button
                      className="rounded border px-2 py-1 transition-colors hover:bg-slate-100"
                      title="Setzt den Monat auf 'closed' und verhindert weitere Eintraege."
                      onClick={() => void updatePlanStatus(plan.id, "closed")}
                    >
                      Close
                    </button>
                    <button
                      className="rounded border px-2 py-1 transition-colors hover:bg-slate-100"
                      title="Startet die automatische Dienstplan-Generierung fuer den ausgewaehlten Monat."
                      onClick={() => void triggerGeneration(plan.id)}
                    >
                      Generieren
                    </button>
                    <button
                      className="rounded border px-2 py-1 transition-colors hover:bg-slate-100"
                      title="Veroeffentlicht den Plan, damit Mitarbeiter den finalen Dienstplan sehen."
                      onClick={() => void updatePlanStatus(plan.id, "published")}
                    >
                      Publizieren
                    </button>
                    <button
                      className="rounded border px-2 py-1 transition-colors hover:bg-slate-100"
                      title="Zeigt den Abgabestatus der Mitarbeiter fuer diesen Monat."
                      onClick={() => setSelectedPlanId(plan.id)}
                    >
                      Abgaben
                    </button>
                    <button
                      className="rounded border px-2 py-1 transition-colors hover:bg-slate-100"
                      title="Exportiert den Dienstplan als PDF und Excel-Datei."
                      onClick={() => void handleExport(plan.id)}
                    >
                      PDF/Excel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium">Schichtzeiten pro Monat</h2>
          <p className="mt-1 text-sm text-slate-600">Diese Zeiten sehen Mitarbeiter bei der Wunschplanung.</p>
          <label className="mt-3 block text-sm">
            Monat fuer Schichtzeiten
            <select
              className="ml-2 rounded border px-2 py-1"
              value={shiftEditorPlanId ?? ""}
              onChange={(e) => setShiftEditorPlanId(e.target.value || null)}
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {`${plan.month}.${plan.year} (${plan.status})`}
                </option>
              ))}
            </select>
          </label>
          <ul className="mt-3 space-y-2 text-sm">
            {editableShiftTimes.map((item) => (
              <li key={item.shiftTypeId} className="rounded border p-2">
                <div className="mb-2 font-medium">{item.name}</div>
                <div className="flex flex-wrap items-end gap-2">
                  <label>
                    Start
                    <input
                      className="ml-2 rounded border px-2 py-1"
                      type="time"
                      value={item.start}
                      onChange={(e) => updateEditableShiftTime(item.shiftTypeId, "start", e.target.value)}
                    />
                  </label>
                  <label>
                    Ende
                    <input
                      className="ml-2 rounded border px-2 py-1"
                      type="time"
                      value={item.end}
                      onChange={(e) => updateEditableShiftTime(item.shiftTypeId, "end", e.target.value)}
                    />
                  </label>
                  <button className="rounded border px-3 py-1" onClick={() => void saveShiftTimeOverride(item)}>
                    Speichern
                  </button>
                  <button className="rounded border border-red-300 px-3 py-1 text-red-700" onClick={() => void deleteShiftType(item.shiftTypeId, item.name)}>
                    Loeschen
                  </button>
                </div>
              </li>
            ))}
            {!activeShifts.length ? <li className="text-slate-500">Keine aktiven Schichttypen gefunden.</li> : null}
          </ul>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium">Abgabestatus</h2>
          <p className="text-sm text-slate-600">Aktualisiert sich automatisch über Supabase Realtime.</p>
          <ul className="mt-2 space-y-2 text-sm">
            {submissions.map((submission) => (
              <li key={submission.employee_id} className="rounded border p-2">
                {(submission.profiles?.[0]?.full_name ?? submission.employee_id)}: {submission.is_submitted ? "Eingereicht" : "Offen"}
              </li>
            ))}
            {!submissions.length ? <li className="text-slate-500">Keine Einträge.</li> : null}
          </ul>
        </div>
      </section>
    </main>
  );
}
