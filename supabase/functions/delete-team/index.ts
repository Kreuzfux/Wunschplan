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

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Nur Admins dürfen Teams löschen." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Abuse guard: avoid rapid repeated destructive operations.
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { count } = await adminClient
      .from("audit_log")
      .select("*", { count: "exact", head: true })
      .eq("actor_id", authData.user.id)
      .in("action", ["team_delete", "team_archive", "user_delete"])
      .gte("created_at", since);
    if ((count ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: "Zu viele kritische Aktionen in kurzer Zeit. Bitte später erneut versuchen." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const teamId = String((body as any).team_id ?? "");
    if (!teamId) {
      return new Response(JSON.stringify({ error: "team_id fehlt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ count: profileCount }, { count: planCount }, { count: shiftCount }] = await Promise.all([
      adminClient.from("profiles").select("*", { count: "exact", head: true }).eq("team_id", teamId),
      adminClient.from("monthly_plans").select("*", { count: "exact", head: true }).eq("team_id", teamId),
      adminClient.from("shift_types").select("*", { count: "exact", head: true }).eq("team_id", teamId),
    ]);

    const hasDeps = (profileCount ?? 0) > 0 || (planCount ?? 0) > 0 || (shiftCount ?? 0) > 0;
    if (hasDeps) {
      const { error: archiveError } = await adminClient.from("teams").update({ is_active: false }).eq("id", teamId);
      if (archiveError) {
        return new Response(JSON.stringify({ error: archiveError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await adminClient.from("audit_log").insert({
        actor_id: authData.user.id,
        team_id: teamId,
        action: "team_archive",
        entity: "team",
        entity_id: teamId,
        payload: { reason: "dependencies" },
      });
      return new Response(
        JSON.stringify({
          success: true,
          action: "archived",
          reason: "Team hat noch zugeordnete Daten (Benutzer/Monate/Schichten).",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: deleteError } = await adminClient.from("teams").delete().eq("id", teamId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient.from("audit_log").insert({
      actor_id: authData.user.id,
      team_id: teamId,
      action: "team_delete",
      entity: "team",
      entity_id: teamId,
      payload: {},
    });

    return new Response(JSON.stringify({ success: true, action: "deleted" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

