import { useEffect, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type {
  AuditLogEntry,
  EmployeeShiftLimit,
  GenerateScheduleResponse,
  MonthlyPlan,
  Profile,
  ShiftType,
  Team,
  UserRole,
} from "@/types";
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
  const [planTeamFilter, setPlanTeamFilter] = useState("all");
  const [newTeamName, setNewTeamName] = useState("");
  const [newShiftName, setNewShiftName] = useState("");
  const [newShiftStart, setNewShiftStart] = useState("08:00");
  const [newShiftEnd, setNewShiftEnd] = useState("16:00");
  const [newShiftColor, setNewShiftColor] = useState("#3B82F6");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [shiftEditorPlanId, setShiftEditorPlanId] = useState<string | null>(null);
  const [editableShiftTimes, setEditableShiftTimes] = useState<EditableShiftTime[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditActorName, setAuditActorName] = useState<Record<string, string>>({});
  const [auditLoading, setAuditLoading] = useState(false);
  const [shiftLimitsByEmployee, setShiftLimitsByEmployee] = useState<Record<string, number>>({});
  const [limitDraftByEmployee, setLimitDraftByEmployee] = useState<Record<string, string>>({});
  const [planMonth, setPlanMonth] = useState(now.getMonth() + 1);
  const [planYear, setPlanYear] = useState(now.getFullYear());
  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() + i);
  const activeShifts = shifts.filter((shift) => shift.is_active !== false);
  const limitsTeamEmployees = profiles
    .filter((p) => p.role === "employee" && (planTeamFilter === "all" ? false : p.team_id === planTeamFilter))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "de"));

  async function reloadPlans() {
    let query = supabase
      .from("monthly_plans")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (planTeamFilter !== "all") {
      query = query.eq("team_id", planTeamFilter);
    }
    const { data } = await query;
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

  async function reloadAudit(planId: string | null) {
    if (!planId) {
      setAuditEntries([]);
      setAuditActorName({});
      return;
    }
    setAuditLoading(true);
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .eq("entity", "monthly_plan")
      .eq("entity_id", planId)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) {
      setAuditEntries([]);
      setAuditActorName({});
      setAuditLoading(false);
      return;
    }
    const rows = (data ?? []) as AuditLogEntry[];
    setAuditEntries(rows);
    const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[];
    if (actorIds.length) {
      const { data: actorRows } = await supabase.from("profiles").select("id,full_name").in("id", actorIds);
      const map: Record<string, string> = {};
      for (const r of actorRows ?? []) {
        map[(r as any).id] = (r as any).full_name;
      }
      setAuditActorName(map);
    } else {
      setAuditActorName({});
    }
    setAuditLoading(false);
  }

  async function logAudit(action: string, entity: string, entityId: string | null, teamId: string | null, payload?: Record<string, unknown>) {
    // Best effort: audit should never block the main flow.
    try {
      await supabase.from("audit_log").insert({
        actor_id: profile?.id ?? null,
        team_id: teamId,
        action,
        entity,
        entity_id: entityId,
        payload: payload ?? {},
      });
    } catch {
      // ignore
    }
  }

  async function reloadEmployeeShiftLimits() {
    if (planTeamFilter === "all") {
      setShiftLimitsByEmployee({});
      return;
    }
    const empIds = profiles
      .filter((p) => p.role === "employee" && p.team_id === planTeamFilter)
      .map((p) => p.id);
    if (!empIds.length) {
      setShiftLimitsByEmployee({});
      return;
    }
    const { data, error } = await supabase
      .from("employee_shift_limits")
      .select("employee_id,max_shifts_per_month")
      .in("employee_id", empIds);
    if (error) {
      setNotice(error.message);
      setShiftLimitsByEmployee({});
      return;
    }
    const next: Record<string, number> = {};
    for (const row of (data ?? []) as Pick<EmployeeShiftLimit, "employee_id" | "max_shifts_per_month">[]) {
      next[row.employee_id] = row.max_shifts_per_month;
    }
    setShiftLimitsByEmployee(next);
  }

  async function saveEmployeeShiftLimit(employeeId: string) {
    const draft = limitDraftByEmployee[employeeId];
    const fallback =
      shiftLimitsByEmployee[employeeId] !== undefined ? String(shiftLimitsByEmployee[employeeId]) : "";
    const raw = (draft !== undefined ? draft : fallback).trim();
    const n = raw === "" ? 31 : Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 366) {
      setNotice("Max. Schichten: bitte Zahl zwischen 0 und 366 (leer = Standard 31).");
      return;
    }
    const { error } = await supabase.from("employee_shift_limits").upsert(
      { employee_id: employeeId, max_shifts_per_month: n },
      { onConflict: "employee_id" },
    );
    if (error) {
      setNotice(error.message);
      return;
    }
    setShiftLimitsByEmployee((prev) => ({ ...prev, [employeeId]: n }));
    setLimitDraftByEmployee((prev) => {
      const next = { ...prev };
      delete next[employeeId];
      return next;
    });
    setNotice(`Limit gespeichert: ${n} Schichten pro Monat.`);
    await logAudit(
      "limit_set",
      "employee_shift_limit",
      employeeId,
      planTeamFilter === "all" ? null : planTeamFilter,
      { max_shifts_per_month: n },
    );
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
      setPlanTeamFilter(profile.team_id);
    }
  }, [isSuperuser, profile?.team_id]);

  useEffect(() => {
    if (!isAdmin && notice?.toLowerCase().includes("monthly_plans") && !notice.includes("eigenen Team")) {
      setNotice("Als Superuser kannst du Monate nur für dein eigenes Team verwalten.");
    }
  }, [isAdmin, notice]);

  useEffect(() => {
    if (!plans.length) return;
    if (!selectedPlanId) setSelectedPlanId(plans[0].id);
    if (!shiftEditorPlanId) setShiftEditorPlanId(plans[0].id);
  }, [plans, selectedPlanId, shiftEditorPlanId]);

  useEffect(() => {
    void reloadPlans();
  }, [planTeamFilter]);

  useEffect(() => {
    setLimitDraftByEmployee({});
    void reloadEmployeeShiftLimits();
  }, [planTeamFilter, profiles]);

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
    void reloadAudit(selectedPlanId);
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
    if (!(await ensurePlanPrivileges())) {
      return;
    }
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

    const targetTeamId = planTeamFilter === "all" ? null : planTeamFilter;
    if (!targetTeamId) {
      setNotice("Bitte ein Team für den Monat auswählen.");
      return;
    }

    const { error } = await supabase.from("monthly_plans").upsert(
      {
        team_id: targetTeamId,
        year: planYear,
        month: planMonth,
        status: "draft",
        min_staff_per_shift: 1,
      },
      {
        onConflict: "team_id,year,month",
      },
    );
    setNotice(error ? error.message : `Monatsplan ${planMonth}.${planYear} erstellt/aktualisiert.`);
    if (!error) {
      await logAudit("month_upsert", "monthly_plan", null, targetTeamId, { year: planYear, month: planMonth });
      await reloadPlans();
    }
  }

  async function updatePlanStatus(id: string, status: MonthlyPlan["status"]) {
    if (!(await ensurePlanPrivileges())) {
      return;
    }
    const { error } = await supabase.from("monthly_plans").update({ status }).eq("id", id);
    setNotice(error ? error.message : `Status auf '${status}' gesetzt.`);
    if (!error) {
      const planRow = plans.find((p) => p.id === id);
      await logAudit("month_status_set", "monthly_plan", id, planRow?.team_id ?? null, { status });
      await reloadPlans();
      await reloadAudit(id);
    }
  }

  async function triggerGeneration(planId: string) {
    if (!(await ensurePlanPrivileges())) {
      return;
    }
    const { data, error } = await supabase.functions.invoke("generate-schedule", {
      body: { monthly_plan_id: planId },
    });
    if (error) {
      const status = (error as any)?.context?.status;
      const body = (error as any)?.context?.body;
      const normalized = error.message.toLowerCase();
      if (normalized.includes("failed to send a request")) {
        setNotice("Edge Function nicht erreichbar. Bitte Deployment und CORS der Funktion 'generate-schedule' pruefen.");
      } else {
        setNotice(status ? `Fehler ${status}: ${error.message}${body ? ` (${String(body)})` : ""}` : error.message);
      }
      return;
    }
    const result = data as GenerateScheduleResponse | null;
    if (result?.success) {
      const parts = [
        `Generierung fertig: ${result.created} Zuweisung(en).`,
        result.unfilled_slots > 0
          ? `Achtung: ${result.unfilled_slots} Schicht-Slot(s) nicht voll besetzt (Wuensche/Limits pruefen).`
          : null,
        result.skipped_by_limit > 0
          ? `${result.skipped_by_limit} mal wegen Monatslimit uebersprungen.`
          : null,
      ].filter(Boolean);
      setNotice(parts.join(" "));
      const planRow = plans.find((p) => p.id === planId);
      await logAudit("schedule_generate", "monthly_plan", planId, planRow?.team_id ?? null, {
        created: result.created,
        unfilled_slots: result.unfilled_slots,
        skipped_by_limit: result.skipped_by_limit,
      });
      await reloadPlans();
      await reloadAudit(planId);
      return;
    }
    if (result && "error" in result && result.error) {
      setNotice(String(result.error));
      return;
    }
    setNotice("Generierung abgeschlossen.");
    await reloadPlans();
  }

  async function handleExport(planId: string) {
    const planRow = plans.find((p) => p.id === planId);
    const teamName =
      planRow?.team_id ? teams.find((t) => t.id === planRow.team_id)?.name ?? planRow.team_id : "Unbekannt";
    const { data } = await supabase
      .from("schedule_assignments")
      .select("date,start_time,end_time,profiles!schedule_assignments_employee_id_fkey(full_name)")
      .eq("monthly_plan_id", planId);

    const rows = (data ?? []).map((entry: any) => [
      entry.date,
      `${entry.start_time}-${entry.end_time}`,
      entry.profiles?.full_name ?? "Unbekannt",
    ]) as Array<[string, string, string]>;

    const monthLabel =
      planRow ? format(new Date(planRow.year, planRow.month - 1, 1), "MMMM yyyy", { locale: de }) : "Unbekannter Monat";
    const stand = new Date().toLocaleString("de-DE");
    const statusLabel = planRow?.status ? `Status: ${planRow.status}` : "Status unbekannt";
    const title = `Dienstplan Team ${teamName} – ${monthLabel} – ${statusLabel} – Stand: ${stand}`;
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

  async function deleteUser(userId: string) {
    const { error } = await supabase.functions.invoke("delete-user", { body: { user_id: userId } });
    if (error) {
      const status = (error as any)?.context?.status;
      const body = (error as any)?.context?.body;
      setNotice(status ? `Fehler ${status}: ${error.message}${body ? ` (${String(body)})` : ""}` : error.message);
      return;
    }
    setNotice("Benutzer wurde gelöscht/anonymisiert.");
    if (!error) {
      await reloadProfiles();
    }
  }

  async function deleteTeam(teamId: string) {
    const { data, error } = await supabase.functions.invoke("delete-team", { body: { team_id: teamId } });
    if (error) {
      const status = (error as any)?.context?.status;
      const body = (error as any)?.context?.body;
      setNotice(status ? `Fehler ${status}: ${error.message}${body ? ` (${String(body)})` : ""}` : error.message);
      return;
    }
    const action = (data as any)?.action;
    if (action === "archived") {
      setNotice("Team wurde archiviert (es gab noch zugeordnete Daten).");
    } else {
      setNotice("Team wurde gelöscht.");
    }
    await reloadTeams();
    await reloadProfiles();
  }

  async function deletePlan(planId: string) {
    if (!(await ensurePlanPrivileges())) {
      return;
    }
    const { error } = await supabase.from("monthly_plans").delete().eq("id", planId);
    setNotice(error ? error.message : "Monat wurde gelöscht.");
    if (!error) await reloadPlans();
  }

  async function ensurePlanPrivileges() {
    if (!profile?.id) {
      setNotice("Benutzerprofil konnte nicht geladen werden. Bitte neu anmelden.");
      return false;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", profile.id)
      .maybeSingle();
    if (error) {
      setNotice(error.message);
      return false;
    }
    if (data?.role !== "admin" && data?.role !== "superuser") {
      setNotice("Nur Admins und Superuser dürfen diese Aktion ausführen.");
      return false;
    }
    if (data?.role === "superuser" && planTeamFilter === "all") {
      setNotice("Superuser dürfen nur Monate ihres eigenen Teams verwalten.");
      return false;
    }
    return true;
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{isSuperuser ? "Team-Admin Bereich" : "Admin-Bereich"}</h1>
          <p className="text-sm text-slate-600">Hallo, {profile?.full_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="rounded border px-3 py-2 text-sm" to="/profil">
            Profil
          </Link>
          <button className="rounded border px-3 py-2 text-sm" onClick={() => void signOut()}>
            Ausloggen
          </button>
        </div>
      </header>

      {notice ? <p className="mb-3 rounded bg-slate-100 p-3 text-sm">{notice}</p> : null}

      <section className="mb-4 rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium">Monatsplanung</h2>
        {!isAdmin ? (
          <p className="mt-1 text-sm text-slate-600">
            Als Superuser kannst du Monate nur für dein eigenes Team anlegen und löschen.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Team
            <select
              className="ml-2 rounded border px-2 py-1"
              value={planTeamFilter}
              onChange={(e) => setPlanTeamFilter(e.target.value)}
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
          <button
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
            disabled={isSuperuser && planTeamFilter === "all"}
            onClick={() => void createSelectedMonthPlan()}
          >
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
                      disabled={isSuperuser && planTeamFilter === "all"}
                      onClick={() => void updatePlanStatus(plan.id, "open")}
                    >
                      Open
                    </button>
                    <button
                      className="rounded border px-2 py-1 transition-colors hover:bg-slate-100"
                      title="Setzt den Monat auf 'closed' und verhindert weitere Eintraege."
                      disabled={isSuperuser && planTeamFilter === "all"}
                      onClick={() => void updatePlanStatus(plan.id, "closed")}
                    >
                      Close
                    </button>
                    <button
                      className="rounded border px-2 py-1 transition-colors hover:bg-slate-100"
                      title="Startet die automatische Dienstplan-Generierung fuer den ausgewaehlten Monat."
                      disabled={isSuperuser && planTeamFilter === "all"}
                      onClick={() => void triggerGeneration(plan.id)}
                    >
                      Generieren
                    </button>
                    <button
                      className="rounded border px-2 py-1 transition-colors hover:bg-slate-100"
                      title="Veroeffentlicht den Plan, damit Mitarbeiter den finalen Dienstplan sehen."
                      disabled={isSuperuser && planTeamFilter === "all"}
                      onClick={() => void updatePlanStatus(plan.id, "published")}
                    >
                      Publizieren
                    </button>
                    <button
                      className="rounded border border-red-300 px-2 py-1 text-red-700 disabled:opacity-60"
                      disabled={isSuperuser && planTeamFilter === "all"}
                      onClick={() => void deletePlan(plan.id)}
                    >
                      Löschen
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

        <div className="mt-4 rounded border p-3">
          <h3 className="font-medium">Änderungshistorie</h3>
          {auditLoading ? (
            <p className="mt-2 text-sm text-slate-600">Historie wird geladen...</p>
          ) : auditEntries.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {auditEntries.map((entry) => (
                <li key={entry.id} className="rounded border p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(entry.created_at).toLocaleString("de-DE")}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">
                    von {entry.actor_id ? (auditActorName[entry.actor_id] ?? entry.actor_id) : "System"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Keine Einträge.</p>
          )}
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
                    Löschen
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

      {isAdmin || isSuperuser ? (
        <section className="mt-4 rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium">Mitarbeiter-Limits (Schichten pro Monat)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Die Dienstplan-Generierung weist pro Kalendermonat höchstens so viele Schichten zu. Leeres Feld = Standard 31.
            {isSuperuser ? " Du pflegst nur Mitarbeiter deines Teams." : null}
          </p>
          {planTeamFilter === "all" ? (
            <p className="mt-2 text-sm text-amber-800">
              Bitte oben bei Monatsplanung ein Team wählen, um Limits zu bearbeiten.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {limitsTeamEmployees.map((emp) => {
                const stored = shiftLimitsByEmployee[emp.id];
                const draft = limitDraftByEmployee[emp.id];
                const inputValue =
                  draft !== undefined ? draft : stored !== undefined ? String(stored) : "";
                return (
                  <li key={emp.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                    <span className="min-w-[10rem] font-medium">{emp.full_name}</span>
                    <label className="text-slate-600">
                      Max. / Monat
                      <input
                        className="ml-2 w-20 rounded border px-2 py-1"
                        type="number"
                        min={0}
                        max={366}
                        placeholder="31"
                        value={inputValue}
                        onChange={(e) =>
                          setLimitDraftByEmployee((prev) => ({ ...prev, [emp.id]: e.target.value }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="rounded border px-3 py-1"
                      onClick={() => void saveEmployeeShiftLimit(emp.id)}
                    >
                      Speichern
                    </button>
                  </li>
                );
              })}
              {!limitsTeamEmployees.length ? (
                <li className="text-slate-500">Keine Mitarbeiter in diesem Team.</li>
              ) : null}
            </ul>
          )}
        </section>
      ) : null}

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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{team.name}</span>
                    <button
                      className="rounded border border-red-300 px-3 py-1 text-red-700"
                      title="Löscht das Team, wenn keine Daten mehr zugeordnet sind; sonst wird es archiviert."
                      onClick={() => void deleteTeam(team.id)}
                    >
                      Löschen
                    </button>
                  </div>
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
                          <button
                            className="rounded border border-red-300 px-3 py-1 text-red-700"
                            title="Entfernt den Login und anonymisiert das Profil (historische Daten bleiben ohne Personenbezug)."
                            onClick={() => void deleteUser(member.id)}
                          >
                            Löschen
                          </button>
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
