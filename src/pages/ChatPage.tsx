import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import type { ChatAttachment, ChatMessage, ChatThread, Profile } from "@/types";

type Tab = "team" | "dm";

interface DmUserOption {
  id: string;
  full_name: string;
}

function formatTs(ts: string) {
  return format(new Date(ts), "dd.MM.yyyy HH:mm", { locale: de });
}

export function ChatPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("team");

  const [teamThreadId, setTeamThreadId] = useState<string | null>(null);
  const [dmThreadId, setDmThreadId] = useState<string | null>(null);

  const [dmUsers, setDmUsers] = useState<DmUserOption[]>([]);
  const [selectedDmUserId, setSelectedDmUserId] = useState<string>("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<Map<string, ChatAttachment[]>>(new Map());
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());

  const [newMessage, setNewMessage] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeThreadId = tab === "team" ? teamThreadId : dmThreadId;
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => {
    if (!activeThreadId) return false;
    if (tab === "dm" && !dmThreadId) return false;
    return Boolean(newMessage.trim() || uploadFile);
  }, [activeThreadId, dmThreadId, newMessage, uploadFile, tab]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeThreadId]);

  useEffect(() => {
    async function loadTeamThread() {
      if (!profile?.team_id) return;
      // Ensure team thread exists. Admin can create; employees rely on existing row.
      const { data } = await supabase
        .from("chat_threads")
        .select("id,team_id,thread_type,created_at")
        .eq("team_id", profile.team_id)
        .eq("thread_type", "team")
        .maybeSingle();
      setTeamThreadId((data as ChatThread | null)?.id ?? null);
    }
    loadTeamThread();
  }, [profile?.team_id]);

  useEffect(() => {
    async function loadDmUsers() {
      if (!profile?.team_id) return;
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("team_id", profile.team_id)
        .eq("is_active", true)
        .order("full_name");
      const options = ((data ?? []) as DmUserOption[]).filter((u) => u.id !== profile.id);
      setDmUsers(options);
    }
    loadDmUsers();
  }, [profile?.team_id, profile?.id]);

  useEffect(() => {
    setMessages([]);
    setAttachments(new Map());
    setProfilesById(new Map());
    setError(null);
  }, [activeThreadId]);

  useEffect(() => {
    let isCancelled = false;
    async function loadThreadData() {
      if (!activeThreadId) return;
      const { data: msgData, error: msgError } = await supabase
        .from("chat_messages")
        .select("id,thread_id,sender_id,body,created_at,deleted_at,deleted_by")
        .eq("thread_id", activeThreadId)
        .order("created_at", { ascending: true })
        .limit(300);

      if (msgError) {
        if (!isCancelled) setError(msgError.message);
        return;
      }
      const msgs = (msgData ?? []) as ChatMessage[];
      if (!isCancelled) setMessages(msgs);

      const senderIds = Array.from(new Set(msgs.map((m) => m.sender_id)));
      if (senderIds.length) {
        const { data: pData } = await supabase.from("profiles").select("id,email,full_name,role,team_id,has_drivers_license,is_active,avatar_url").in("id", senderIds);
        const map = new Map<string, Profile>();
        for (const p of (pData ?? []) as Profile[]) map.set(p.id, p);
        if (!isCancelled) setProfilesById(map);
      }

      const msgIds = msgs.map((m) => m.id);
      if (msgIds.length) {
        const { data: aData } = await supabase
          .from("chat_attachments")
          .select("id,message_id,storage_path,mime_type,size_bytes,created_at")
          .in("message_id", msgIds);
        const aMap = new Map<string, ChatAttachment[]>();
        for (const a of (aData ?? []) as ChatAttachment[]) {
          const arr = aMap.get(a.message_id) ?? [];
          arr.push(a);
          aMap.set(a.message_id, arr);
        }
        if (!isCancelled) setAttachments(aMap);
      }
    }
    loadThreadData();
    return () => {
      isCancelled = true;
    };
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) return;
    const channel = supabase
      .channel(`chat:${activeThreadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `thread_id=eq.${activeThreadId}` },
        async () => {
          const { data } = await supabase
            .from("chat_messages")
            .select("id,thread_id,sender_id,body,created_at,deleted_at,deleted_by")
            .eq("thread_id", activeThreadId)
            .order("created_at", { ascending: true })
            .limit(300);
          setMessages((data ?? []) as ChatMessage[]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeThreadId]);

  async function ensureDmThread(otherUserId: string) {
    const { data, error: fnError } = await supabase.functions.invoke("create-dm-thread", {
      body: { other_user_id: otherUserId },
    });
    if (fnError) throw fnError;
    if (!data?.thread_id) throw new Error("DM Thread konnte nicht erstellt werden.");
    setDmThreadId(String(data.thread_id));
  }

  async function send() {
    if (!profile || !activeThreadId) return;
    setBusy(true);
    setError(null);
    try {
      // 1) insert message
      const body = newMessage.trim() ? newMessage.trim() : null;
      const { data: msg, error: msgError } = await supabase
        .from("chat_messages")
        .insert({ thread_id: activeThreadId, sender_id: profile.id, body })
        .select("id,thread_id,sender_id,body,created_at,deleted_at,deleted_by")
        .single();
      if (msgError) throw msgError;

      // 2) upload attachment (optional)
      if (uploadFile) {
        const maxSizeBytes = 10 * 1024 * 1024;
        if (uploadFile.size > maxSizeBytes) throw new Error("Datei zu groß (max. 10 MB).");

        const safeName = uploadFile.name.replace(/[^\w.\-]+/g, "_");
        const storagePath = `${activeThreadId}/${msg.id}/${Date.now()}_${safeName}`;

        const { error: upError } = await supabase.storage.from("chat-attachments").upload(storagePath, uploadFile, {
          contentType: uploadFile.type || "application/octet-stream",
          upsert: false,
        });
        if (upError) throw upError;

        const { error: aError } = await supabase.from("chat_attachments").insert({
          message_id: msg.id,
          storage_path: storagePath,
          mime_type: uploadFile.type || "application/octet-stream",
          size_bytes: uploadFile.size,
        });
        if (aError) throw aError;
      }

      setNewMessage("");
      setUploadFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function softDelete(message: ChatMessage) {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const { error: delError } = await supabase
        .from("chat_messages")
        .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id, body: null })
        .eq("id", message.id);
      if (delError) throw delError;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function downloadAttachment(att: ChatAttachment) {
    const { data, error: dlError } = await supabase.storage.from("chat-attachments").download(att.storage_path);
    if (dlError || !data) {
      setError(dlError?.message ?? "Download fehlgeschlagen.");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.storage_path.split("/").slice(-1)[0] ?? "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Chat</h1>
          <div className="flex gap-2">
            <button
              className={`px-3 py-1 rounded border ${tab === "team" ? "bg-gray-900 text-white" : "bg-white"}`}
              onClick={() => setTab("team")}
            >
              Teamchat
            </button>
            <button
              className={`px-3 py-1 rounded border ${tab === "dm" ? "bg-gray-900 text-white" : "bg-white"}`}
              onClick={() => setTab("dm")}
            >
              Direkt
            </button>
          </div>
        </div>
        <Link to="/dashboard" className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200">
          Zur Planung
        </Link>
      </div>

      {tab === "dm" ? (
        <div className="mb-4 flex flex-col md:flex-row gap-2 md:items-center">
          <select
            className="border rounded px-3 py-2"
            value={selectedDmUserId}
            onChange={(e) => setSelectedDmUserId(e.target.value)}
          >
            <option value="">Person auswählen…</option>
            {dmUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
          <button
            className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            disabled={!selectedDmUserId || busy}
            onClick={() => ensureDmThread(selectedDmUserId)}
          >
            DM öffnen
          </button>
        </div>
      ) : null}

      {error ? <div className="mb-3 p-3 rounded bg-red-50 text-red-700 border border-red-200">{error}</div> : null}

      {!activeThreadId ? (
        <div className="p-6 rounded border bg-gray-50">
          {tab === "team" ? (
            <div>
              Teamchat ist noch nicht verfügbar. (Ein Admin muss einmalig den Team‑Thread anlegen.)
            </div>
          ) : (
            <div>Bitte eine Person auswählen und „DM öffnen“ klicken.</div>
          )}
        </div>
      ) : (
        <div className="rounded border">
          <div className="h-[55vh] overflow-auto p-3 space-y-3 bg-white">
            {messages.map((m) => {
              const sender = profilesById.get(m.sender_id);
              const isMine = profile?.id === m.sender_id;
              const msgAttachments = attachments.get(m.id) ?? [];
              return (
                <div key={m.id} className={`p-3 rounded border ${isMine ? "bg-blue-50 border-blue-100" : "bg-gray-50"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className="font-semibold">{sender?.full_name ?? "Unbekannt"}</span>{" "}
                      <span className="text-gray-600">{formatTs(m.created_at)}</span>
                    </div>
                    <div className="flex gap-2">
                      {!m.deleted_at ? (
                        <button
                          className="text-sm px-2 py-1 rounded bg-white border hover:bg-gray-100 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => softDelete(m)}
                        >
                          Löschen
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap">
                    {m.deleted_at ? <span className="italic text-gray-500">Nachricht gelöscht</span> : m.body}
                  </div>
                  {msgAttachments.length ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {msgAttachments.map((a) => (
                        <button
                          key={a.id}
                          className="text-left text-sm px-2 py-1 rounded bg-white border hover:bg-gray-100"
                          onClick={() => downloadAttachment(a)}
                        >
                          Datei: {a.storage_path.split("/").slice(-1)[0]} ({Math.ceil(a.size_bytes / 1024)} KB)
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t bg-gray-50">
            <div className="flex flex-col gap-2">
              <textarea
                className="w-full border rounded px-3 py-2"
                placeholder="Nachricht schreiben…"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={3}
              />
              <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
                <input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
                <button
                  className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-50"
                  disabled={!canSend || busy}
                  onClick={send}
                >
                  {busy ? "Sende…" : "Senden"}
                </button>
              </div>
              {uploadFile ? <div className="text-sm text-gray-700">Anhang: {uploadFile.name}</div> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

