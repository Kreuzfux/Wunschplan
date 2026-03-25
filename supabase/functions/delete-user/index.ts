import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function deletedEmailFor(id: string) {
  // RFC 2606 reserved domain, never deliverable.
  return `deleted+${id}@example.invalid`;
}

serve(async (req) => {
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

    const body = await req.json().catch(() => ({}));
    const targetUserId = String((body as any).user_id ?? "");
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "user_id fehlt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role,team_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id,role,team_id")
      .eq("id", targetUserId)
      .maybeSingle();

    if (!callerProfile?.role) {
      return new Response(JSON.stringify({ error: "Profil des Aufrufers nicht gefunden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!targetProfile) {
      return new Response(JSON.stringify({ error: "Zielbenutzer nicht gefunden." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = callerProfile.role === "admin";
    const isSuperuser = callerProfile.role === "superuser";
    const sameTeam = callerProfile.team_id && targetProfile.team_id && callerProfile.team_id === targetProfile.team_id;

    if (!isAdmin && !(isSuperuser && sameTeam)) {
      return new Response(JSON.stringify({ error: "Keine Berechtigung, diesen Benutzer zu löschen." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetProfile.role === "admin" && !isAdmin) {
      return new Response(JSON.stringify({ error: "Admins können nur von Admins gelöscht werden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove personal wish data (not required for historical schedule visibility).
    await adminClient.from("shift_wishes").delete().eq("employee_id", targetUserId);
    await adminClient.from("wish_submissions").delete().eq("employee_id", targetUserId);
    await adminClient.from("employee_shift_limits").delete().eq("employee_id", targetUserId);

    // Delete auth user (revokes future logins).
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteAuthError) {
      return new Response(JSON.stringify({ error: `Auth-Löschung fehlgeschlagen: ${deleteAuthError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Anonymize profile (keeps historical references without PII).
    const { error: anonymizeError } = await adminClient
      .from("profiles")
      .update({
        email: deletedEmailFor(targetUserId),
        full_name: "Gelöschter Benutzer",
        role: "employee",
        is_active: false,
        team_id: null,
        phone: null,
      })
      .eq("id", targetUserId);
    if (anonymizeError) {
      return new Response(JSON.stringify({ error: `Profil-Anonymisierung fehlgeschlagen: ${anonymizeError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

