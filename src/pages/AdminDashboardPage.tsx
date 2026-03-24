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
}

export function AdminDashboardPage() {
  const { signOut } = useAuth();
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [shifts, setShifts] = useState<ShiftType[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("monthly_plans").select("*").order("year", { ascending: false }).order("month", { ascending: false }).then(({ data }) => setPlans(data ?? []));
    supabase.from("shift_types").select("*").order("sort_order").then(({ data }) => setShifts(data ?? []));
  }, []);

  useEffect(() => {
    if (!selectedPlanId) return;
    supabase
      .from("wish_submissions")
      .select("employee_id,is_submitted")
      .eq("monthly_plan_id", selectedPlanId)
      .then(({ data }) => setSubmissions((data ?? []) as SubmissionRow[]));
  }, [selectedPlanId]);

  async function createCurrentMonthPlan() {
    const now = new Date();
    const { error } = await supabase.from("monthly_plans").upsert({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      status: "draft",
      min_staff_per_shift: 1,
    });
    setNotice(error ? error.message : "Monatsplan erstellt/aktualisiert.");
  }

  async function updatePlanStatus(id: string, status: MonthlyPlan["status"]) {
    const { error } = await supabase.from("monthly_plans").update({ status }).eq("id", id);
    setNotice(error ? error.message : `Status auf '${status}' gesetzt.`);
  }

  async function triggerGeneration(planId: string) {
    const { error } = await supabase.functions.invoke("generate-schedule", {
      body: { monthly_plan_id: planId },
    });
    setNotice(error ? error.message : "Dienstplan-Generierung gestartet.");
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
        <button className="mt-3 rounded bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => void createCurrentMonthPlan()}>
          Aktuellen Monat anlegen
        </button>
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
                    <button className="rounded border px-2 py-1" onClick={() => void updatePlanStatus(plan.id, "open")}>Open</button>
                    <button className="rounded border px-2 py-1" onClick={() => void updatePlanStatus(plan.id, "closed")}>Close</button>
                    <button className="rounded border px-2 py-1" onClick={() => void triggerGeneration(plan.id)}>Generieren</button>
                    <button className="rounded border px-2 py-1" onClick={() => void updatePlanStatus(plan.id, "published")}>Publizieren</button>
                    <button className="rounded border px-2 py-1" onClick={() => setSelectedPlanId(plan.id)}>Abgaben</button>
                    <button className="rounded border px-2 py-1" onClick={() => void handleExport(plan.id)}>PDF/Excel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium">Schichttypen</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {shifts.map((shift) => (
              <li key={shift.id} className="flex items-center justify-between rounded border p-2">
                <span>{shift.name}</span>
                <span>{shift.default_start_time} - {shift.default_end_time}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium">Abgabestatus</h2>
          <p className="text-sm text-slate-600">Echtzeitfähig über Supabase Realtime erweiterbar.</p>
          <ul className="mt-2 space-y-2 text-sm">
            {submissions.map((submission) => (
              <li key={submission.employee_id} className="rounded border p-2">
                {submission.employee_id}: {submission.is_submitted ? "Eingereicht" : "Offen"}
              </li>
            ))}
            {!submissions.length ? <li className="text-slate-500">Keine Einträge.</li> : null}
          </ul>
        </div>
      </section>
    </main>
  );
}
