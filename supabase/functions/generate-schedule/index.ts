import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const allowedOrigins = new Set([
  "https://kreuzfux.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function buildCorsHeaders(origin: string | null) {
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : "https://kreuzfux.github.io";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
const ADMIN_EMAIL = "nitzschkepa@yahoo.de";
const ADMIN_USER_ID = "b6210438-2ad6-4387-b4d6-99ba8f87cd76";

const DEFAULT_MAX_SHIFTS_PER_MONTH = 31;

type WishRow = {
  employee_id: string;
  date: string;
  shift_type_id: string | null;
  custom_start_time: string | null;
  custom_end_time: string | null;
};

function dedupeWishesByEmployee(wishes: WishRow[]): WishRow[] {
  const map = new Map<string, WishRow>();
  for (const w of wishes) {
    if (!map.has(w.employee_id)) map.set(w.employee_id, w);
  }
  return Array.from(map.values());
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Kein Auth-Token." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role,team_id")
      .eq("id", authData.user.id)
      .maybeSingle();
    const email = authData.user.email?.toLowerCase() ?? "";
    const { monthly_plan_id } = await req.json();
    if (!monthly_plan_id) {
      return new Response(JSON.stringify({ error: "monthly_plan_id fehlt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: plan } = await adminClient
      .from("monthly_plans")
      .select("id,min_staff_per_shift,team_id")
      .eq("id", monthly_plan_id)
      .single();
    if (!plan) {
      return new Response(JSON.stringify({ error: "Monatsplan nicht gefunden." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const canGenerate =
      profile?.role === "admin" ||
      (profile?.role === "superuser" && profile.team_id === plan.team_id) ||
      authData.user.id === ADMIN_USER_ID ||
      email === ADMIN_EMAIL;
    if (!canGenerate) {
      return new Response(JSON.stringify({ error: "Nicht berechtigt für die Generierung dieses Teams." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: teamProfiles } = await adminClient.from("profiles").select("id").eq("team_id", plan.team_id);
    const teamMemberIds = new Set((teamProfiles ?? []).map((p: { id: string }) => p.id));

    const { data: wishes } = await adminClient
      .from("shift_wishes")
      .select("employee_id,date,shift_type_id,custom_start_time,custom_end_time")
      .eq("monthly_plan_id", monthly_plan_id)
      .in("wish_type", ["available", "custom_time"]);

    const wishesInTeam = (wishes ?? []).filter((w: WishRow) => teamMemberIds.has(w.employee_id));

    const wishEmployeeIds = [...new Set(wishesInTeam.map((w: WishRow) => w.employee_id))];
    const limitMap = new Map<string, number>();

    if (wishEmployeeIds.length > 0) {
      const { data: limitRows } = await adminClient
        .from("employee_shift_limits")
        .select("employee_id,max_shifts_per_month")
        .eq("team_id", plan.team_id)
        .in("employee_id", wishEmployeeIds);
      for (const row of limitRows ?? []) {
        limitMap.set((row as { employee_id: string }).employee_id, (row as { max_shifts_per_month: number }).max_shifts_per_month);
      }
    }

    const maxFor = (employeeId: string) => limitMap.get(employeeId) ?? DEFAULT_MAX_SHIFTS_PER_MONTH;

    await adminClient.from("schedule_assignments").delete().eq("monthly_plan_id", monthly_plan_id);

    const grouped = new Map<string, WishRow[]>();
    for (const wish of wishesInTeam) {
      const key = `${wish.date}::${wish.shift_type_id ?? "custom"}`;
      const list = grouped.get(key) ?? [];
      list.push(wish);
      grouped.set(key, list);
    }

    const sortedKeys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

    const assignmentCount = new Map<string, number>();
    const inserts: Record<string, unknown>[] = [];
    let skippedByLimit = 0;
    let unfilledSlots = 0;
    const minStaff = Math.max(1, Number(plan.min_staff_per_shift) || 1);

    for (const key of sortedKeys) {
      const rawList = grouped.get(key)!;
      const candidates = dedupeWishesByEmployee(rawList);
      const sortedFull = [...candidates].sort((a, b) => {
        const ca = assignmentCount.get(a.employee_id) ?? 0;
        const cb = assignmentCount.get(b.employee_id) ?? 0;
        if (ca !== cb) return ca - cb;
        return a.employee_id.localeCompare(b.employee_id);
      });

      const chosen: WishRow[] = [];
      for (const c of sortedFull) {
        if (chosen.length >= minStaff) break;
        const current = assignmentCount.get(c.employee_id) ?? 0;
        const cap = maxFor(c.employee_id);
        if (current >= cap) {
          skippedByLimit += 1;
          continue;
        }
        chosen.push(c);
      }

      if (chosen.length < minStaff) {
        unfilledSlots += 1;
      }

      const [date, shiftTypeId] = key.split("::");
      for (const candidate of chosen) {
        assignmentCount.set(candidate.employee_id, (assignmentCount.get(candidate.employee_id) ?? 0) + 1);
        inserts.push({
          monthly_plan_id,
          employee_id: candidate.employee_id,
          date,
          shift_type_id: shiftTypeId === "custom" ? null : shiftTypeId,
          start_time: candidate.custom_start_time ?? "10:00",
          end_time: candidate.custom_end_time ?? "15:00",
        });
      }
    }

    if (inserts.length) {
      await adminClient.from("schedule_assignments").insert(inserts);
    }
    await adminClient.from("monthly_plans").update({ status: "generated" }).eq("id", monthly_plan_id);

    return new Response(
      JSON.stringify({
        success: true,
        created: inserts.length,
        unfilled_slots: unfilledSlots,
        skipped_by_limit: skippedByLimit,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
