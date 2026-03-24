import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

serve(async (req) => {
  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "Kein Auth-Token." }), { status: 401 });

    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !authData.user) return new Response(JSON.stringify({ error: "Nicht autorisiert." }), { status: 401 });

    const { data: profile } = await adminClient.from("profiles").select("role").eq("id", authData.user.id).single();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Nur Admins dürfen generieren." }), { status: 403 });
    }

    const { monthly_plan_id } = await req.json();
    if (!monthly_plan_id) return new Response(JSON.stringify({ error: "monthly_plan_id fehlt." }), { status: 400 });

    const { data: plan } = await adminClient.from("monthly_plans").select("id,min_staff_per_shift").eq("id", monthly_plan_id).single();
    if (!plan) return new Response(JSON.stringify({ error: "Monatsplan nicht gefunden." }), { status: 404 });

    const { data: wishes } = await adminClient
      .from("shift_wishes")
      .select("employee_id,date,shift_type_id,custom_start_time,custom_end_time")
      .eq("monthly_plan_id", monthly_plan_id)
      .in("wish_type", ["available", "custom_time"]);

    await adminClient.from("schedule_assignments").delete().eq("monthly_plan_id", monthly_plan_id);

    const grouped = new Map<string, any[]>();
    for (const wish of wishes ?? []) {
      const key = `${wish.date}::${wish.shift_type_id ?? "custom"}`;
      const list = grouped.get(key) ?? [];
      list.push(wish);
      grouped.set(key, list);
    }

    const assignmentCount = new Map<string, number>();
    const inserts: any[] = [];
    for (const [key, candidates] of grouped.entries()) {
      candidates.sort((a, b) => (assignmentCount.get(a.employee_id) ?? 0) - (assignmentCount.get(b.employee_id) ?? 0));
      const selected = candidates.slice(0, plan.min_staff_per_shift);
      const [date, shiftTypeId] = key.split("::");
      for (const candidate of selected) {
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

    return new Response(JSON.stringify({ success: true, created: inserts.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
