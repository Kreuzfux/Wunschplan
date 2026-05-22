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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Server-Konfiguration unvollständig (SUPABASE_URL/KEYS)." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Kein Auth-Token." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert.", details: authError?.message ?? null }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: caller } = await adminClient.from("profiles").select("id,role").eq("id", authData.user.id).maybeSingle();
    if (caller?.role !== "admin" && caller?.role !== "superuser") {
      return new Response(JSON.stringify({ error: "Nur Admins und Superuser dürfen die Bereinigung ausführen." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const cutoff = new Date(now.getTime());
    cutoff.setMonth(cutoff.getMonth() - 12);
    const cutoffIso = cutoff.toISOString();

    // Find attachments older than cutoff via message created_at.
    const { data: oldAtt } = await adminClient
      .from("chat_attachments")
      .select("id,storage_path,message_id,created_at")
      .lt("created_at", cutoffIso)
      .limit(5000);

    const storagePaths = (oldAtt ?? []).map((a: any) => a.storage_path);
    if (storagePaths.length) {
      // Best-effort: remove from storage, then delete rows.
      await adminClient.storage.from("chat-attachments").remove(storagePaths);
      await adminClient.from("chat_attachments").delete().in(
        "id",
        (oldAtt ?? []).map((a: any) => a.id),
      );
    }

    // Delete messages older than cutoff (attachments will cascade if any remain).
    const { error: msgDelError } = await adminClient.from("chat_messages").delete().lt("created_at", cutoffIso);
    if (msgDelError) {
      return new Response(JSON.stringify({ error: msgDelError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, cutoff: cutoffIso, attachments_removed: storagePaths.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

