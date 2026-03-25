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
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
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
    const otherUserId = String((body as any).other_user_id ?? "");
    if (!otherUserId) {
      return new Response(JSON.stringify({ error: "other_user_id fehlt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (otherUserId === authData.user.id) {
      return new Response(JSON.stringify({ error: "DM mit sich selbst ist nicht erlaubt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("id,team_id")
      .eq("id", authData.user.id)
      .maybeSingle();
    const { data: otherProfile } = await adminClient
      .from("profiles")
      .select("id,team_id")
      .eq("id", otherUserId)
      .maybeSingle();

    if (!callerProfile?.team_id || !otherProfile?.team_id) {
      return new Response(JSON.stringify({ error: "Teamzuordnung fehlt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (callerProfile.team_id !== otherProfile.team_id) {
      return new Response(JSON.stringify({ error: "Direktnachrichten sind nur innerhalb des Teams erlaubt." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find existing DM thread where both users are members.
    const { data: existing } = await adminClient
      .from("chat_threads")
      .select("id,thread_type")
      .eq("thread_type", "dm");

    let threadId: string | null = null;
    for (const t of (existing ?? []) as any[]) {
      const { data: members } = await adminClient
        .from("chat_thread_members")
        .select("user_id")
        .eq("thread_id", t.id);
      const ids = new Set((members ?? []).map((m: any) => m.user_id));
      if (ids.has(authData.user.id) && ids.has(otherUserId) && ids.size === 2) {
        threadId = t.id;
        break;
      }
    }

    if (!threadId) {
      const { data: newThread, error: createError } = await adminClient
        .from("chat_threads")
        .insert({ thread_type: "dm", team_id: callerProfile.team_id })
        .select("id")
        .single();
      if (createError || !newThread?.id) {
        return new Response(JSON.stringify({ error: createError?.message ?? "DM Thread konnte nicht erstellt werden." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      threadId = newThread.id;
      await adminClient.from("chat_thread_members").insert([
        { thread_id: threadId, user_id: authData.user.id },
        { thread_id: threadId, user_id: otherUserId },
      ]);
    }

    return new Response(JSON.stringify({ success: true, thread_id: threadId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

