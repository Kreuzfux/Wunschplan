import { useEffect, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import type { MonthlyPlan, Profile, ShiftType, Team, UserRole } from "@/types";
import { exportSchedulePdf } from "@/utils/pdfExport";
import { exportScheduleExcel } from "@/utils/excelExport";
import { useAuth } from "@/providers/AuthProvider";

interface SubmissionRow {
  employee_id: string;
  is_submitted: boolean;
  full_name?: string;
  team_id?: string | null;
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
  { value: 3, label: "März" },
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
  const { signOut, profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isSuperuser = profile?.role === "superuser";
  const now = new Date();
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [shifts, setShifts] = useState<ShiftType[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [submissionTeamFilter, setSubmissionTeamFilter] = useState("all");
  const [shiftTeamFilter, setShiftTeamFilter] = useState("all");
  const [newTeamName, setNewTeamName] = useState("");
  const [newShiftName, setNewShiftName] = useState("");
  const [newShiftStart, setNewShiftStart] = useState("08:00");
  const [newShiftEnd, setNewShiftEnd] = useState("16:00");
  const [newShiftColor, setNewShiftColor] = useState("#3B82F6");
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
    let query = supabase.from("shift_types").select("*").order("sort_order");
    if (shiftTeamFilter !== "all") {
      query = query.eq("team_id", shiftTeamFilter);
    }
    const { data } = await query;
    setShifts(data ?? []);
  }

  async function reloadTeams() {
    const { data } = await supabase.from("teams").select("*").order("name");
    setTeams((data ?? []) as Team[]);
  }

  async function reloadProfiles() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name", { ascending: true });
    setProfiles((data ?? []) as Profile[]);
  }

  async function reloadSubmissions(planId: string) {
    const { data, error } = await supabase
      .from("wish_submissions")
      .select("employee_id,is_submitted")
      .eq("monthly_plan_id", planId);
    if (error) {
      setSubmissions([]);
      return;
    }

    const baseRows = (data ?? []) as Array<{ employee_id: string; is_submitted: boolean }>;
    const employeeIds = Array.from(new Set(baseRows.map((row) => row.employee_id)));
    if (!employeeIds.length) {
      setSubmissions([]);
      return;
    }

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id,full_name,team_id")
      .in("id", employeeIds);
    const nameMap = new Map((profileRows ?? []).map((row: any) => [row.id, row.full_name as string]));
    const teamMap = new Map((profileRows ?? []).map((row: any) => [row.id, (row.team_id as string | null) ?? null]));

    const mergedRows: SubmissionRow[] = baseRows.map((row) => ({
        employee_id: row.employee_id,
        is_submitted: row.is_submitted,
        full_name: nameMap.get(row.employee_id),
        team_id: teamMap.get(row.employee_id) ?? null,
      }));
    const filteredRows =
      submissionTeamFilter === "all"
        ? mergedRows
        : mergedRows.filter((row) => row.team_id === submissionTeamFilter);
    setSubmissions(filteredRows);
  }

  useEffect(() => {
    void reloadPlans();
    void reloadShifts();
    void reloadTeams();
    void reloadProfiles();
  }, []);

  useEffect(() => {
    if (isSuperuser && profile?.team_id) {
      setSubmissionTeamFilter(profile.team_id);
      setShiftTeamFilter(profile.team_id);
    }
  }, [isSuperuser, profile?.team_id]);

  useEffect(() => {
    if (!plans.length) return;
    if (!selectedPlanId) setSelectedPlanId(plans[0].id);
    if (!shiftEditorPlanId) setShiftEditorPlanId(plans[0].id);
  }, [plans, selectedPlanId, shiftEditorPlanId]);

  useEffect(() => {
    void reloadShifts();
  }, [shiftTeamFilter]);

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
  }, [selectedPlanId, submissionTeamFilter]);

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
    const { error } = await supabase.from("shift_type_overrides").upsert(
      {
        monthly_plan_id: shiftEditorPlanId,
        shift_type_id: item.shiftTypeId,
        override_start_time: item.start,
        override_end_time: item.end,
      },
      {
        onConflict: "monthly_plan_id,shift_type_id",
      },
    );
    setNotice(error ? error.message : `Schichtzeit fuer '${item.name}' gespeichert.`);
  }

  async function deleteShiftType(shiftTypeId: string, shiftName: string) {
    const { error } = await supabase.from("shift_types").update({ is_active: false }).eq("id", shiftTypeId);
    setNotice(error ? error.message : `Schicht '${shiftName}' wurde geloescht.`);
    if (!error) {
      await reloadShifts();
    }
  }

  async function createShiftType() {
    const trimmedName = newShiftName.trim();
    if (!trimmedName) {
      setNotice("Bitte einen Namen für die neue Schicht eingeben.");
      return;
    }
    if (!newShiftStart || !newShiftEnd) {
      setNotice("Bitte Start- und Endzeit für die neue Schicht wählen.");
      return;
    }

    if (shiftTeamFilter === "all") {
      setNotice("Bitte zuerst ein Team für die Schicht auswählen.");
      return;
    }

    let targetTeamId: string | null = shiftTeamFilter;
    if (isSuperuser) {
      if (!profile?.id) {
        setNotice("Superuser-Profil konnte nicht bestimmt werden. Bitte neu anmelden.");
        return;
      }
      const { data: ownProfile, error: ownProfileError } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", profile.id)
        .maybeSingle();
      if (ownProfileError) {
        setNotice(ownProfileError.message);
        return;
      }
      targetTeamId = ownProfile?.team_id ?? null;
      if (targetTeamId) {
        setShiftTeamFilter(targetTeamId);
      }
    }
    if (!targetTeamId) {
      setNotice("Kein gültiges Team für die neue Schicht gefunden.");
      return;
    }

    const maxSortOrder = shifts.reduce((max, shift) => Math.max(max, shift.sort_order ?? 0), 0);
    const { error } = await supabase.from("shift_types").insert({
      name: trimmedName,
      team_id: targetTeamId,
      default_start_time: newShiftStart,
      default_end_time: newShiftEnd,
      color: newShiftColor || "#3B82F6",
      sort_order: maxSortOrder + 1,
      is_active: true,
    });
    setNotice(error ? error.message : `Schicht '${trimmedName}' wurde erstellt.`);
    if (!error) {
      setNewShiftName("");
      setNewShiftStart("08:00");
      setNewShiftEnd("16:00");
      setNewShiftColor("#3B82F6");
      await reloadShifts();
    }
  }

  async function createTeam() {
    const trimmedName = newTeamName.trim();
    if (!trimmedName) {
      setNotice("Bitte einen Teamnamen eingeben.");
      return;
    }
    const { error } = await supabase.from("teams").insert({ name: trimmedName });
    setNotice(error ? error.message : `Team '${trimmedName}' wurde angelegt.`);
    if (!error) {
      setNewTeamName("");
      await reloadTeams();
    }
  }

  async function updateUserRole(userId: string, role: UserRole) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    setNotice(error ? error.message : "Rolle aktualisiert.");
    if (!error) await reloadProfiles();
  }

  async function updateUserTeam(userId: string, teamId: string | null) {
    const { error } = await supabase.from("profiles").update({ team_id: teamId }).eq("id", userId);
    setNotice(error ? error.message : "Teamzuordnung aktualisiert.");
    if (!error) {
      await reloadProfiles();
      if (selectedPlanId) await reloadSubmissions(selectedPlanId);
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
          <label className="mt-2 block text-sm">
            Team für Schichten
            <select
              className="ml-2 rounded border px-2 py-1"
              value={shiftTeamFilter}
              onChange={(e) => setShiftTeamFilter(e.target.value)}
              disabled={isSuperuser}
            >
              {!isSuperuser ? <option value="all">Alle Teams</option> : null}
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 rounded border p-3">
            <h3 className="font-medium">Neue Schicht erstellen</h3>
            <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
              <label>
                Name
                <input
                  className="ml-2 rounded border px-2 py-1"
                  placeholder="z. B. Nachtschicht"
                  value={newShiftName}
                  onChange={(e) => setNewShiftName(e.target.value)}
                />
              </label>
              <label>
                Start
                <input
                  className="ml-2 rounded border px-2 py-1"
                  type="time"
                  value={newShiftStart}
                  onChange={(e) => setNewShiftStart(e.target.value)}
                />
              </label>
              <label>
                Ende
                <input
                  className="ml-2 rounded border px-2 py-1"
                  type="time"
                  value={newShiftEnd}
                  onChange={(e) => setNewShiftEnd(e.target.value)}
                />
              </label>
              <label>
                Farbe
                <input
                  className="ml-2 h-9 w-10 rounded border p-1 align-middle"
                  type="color"
                  value={newShiftColor}
                  onChange={(e) => setNewShiftColor(e.target.value)}
                />
              </label>
              <button className="rounded border px-3 py-1" onClick={() => void createShiftType()}>
                Schicht anlegen
              </button>
            </div>
          </div>
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
          <label className="mt-2 block text-sm">
            Team-Filter
            <select
              className="ml-2 rounded border px-2 py-1"
              value={submissionTeamFilter}
              onChange={(e) => setSubmissionTeamFilter(e.target.value)}
              disabled={isSuperuser}
            >
              {!isSuperuser ? <option value="all">Alle Teams</option> : null}
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <ul className="mt-2 space-y-2 text-sm">
            {submissions.map((submission) => (
              <li key={submission.employee_id} className="rounded border p-2">
                {(submission.full_name ?? submission.employee_id)}: {submission.is_submitted ? "Eingereicht" : "Offen"}
              </li>
            ))}
            {!submissions.length ? <li className="text-slate-500">Keine Einträge.</li> : null}
          </ul>
        </div>
      </section>

      {isAdmin ? (
        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="font-medium">Teams verwalten</h2>
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded border px-3 py-2 text-sm"
                placeholder="Neues Team (z. B. Nord)"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
              <button className="rounded border px-3 py-2 text-sm" onClick={() => void createTeam()}>
                Team anlegen
              </button>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {teams.map((team) => (
                <li key={team.id} className="rounded border p-2">
                  {team.name}
                </li>
              ))}
              {!teams.length ? <li className="text-slate-500">Keine Teams vorhanden.</li> : null}
            </ul>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="font-medium">Benutzer verwalten</h2>
            {(["admin", "superuser", "employee"] as UserRole[]).map((role) => {
              const members = profiles.filter((profileItem) => profileItem.role === role);
              const roleTitle =
                role === "admin" ? "Admins" : role === "superuser" ? "Superuser" : "Mitarbeiter";
              return (
                <div key={role} className="mt-3">
                  <h3 className="mb-2 font-medium">{roleTitle}</h3>
                  <ul className="space-y-2 text-sm">
                    {members.map((member) => (
                      <li key={member.id} className="rounded border p-2">
                        <div className="font-medium">{member.full_name}</div>
                        <div className="text-xs text-slate-500">{member.email}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <label>
                            Rolle
                            <select
                              className="ml-2 rounded border px-2 py-1"
                              value={member.role}
                              onChange={(e) => void updateUserRole(member.id, e.target.value as UserRole)}
                            >
                              <option value="employee">Mitarbeiter</option>
                              <option value="admin">Admin</option>
                              <option value="superuser">Superuser</option>
                            </select>
                          </label>
                          <label>
                            Team
                            <select
                              className="ml-2 rounded border px-2 py-1"
                              value={member.team_id ?? ""}
                              onChange={(e) => void updateUserTeam(member.id, e.target.value || null)}
                            >
                              {teams.map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </li>
                    ))}
                    {!members.length ? <li className="text-slate-500">Keine Einträge.</li> : null}
                  </ul>
                </div>
              );
            })}
            {!profiles.length ? <p className="mt-2 text-sm text-slate-500">Keine Benutzer gefunden.</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
