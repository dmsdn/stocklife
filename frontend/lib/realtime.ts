"use client";

import { useEffect, useRef } from "react";
import { API_BASE_URL, apiFetch, getAccessToken } from "./api-client";
import { getClientId } from "./client-id";
import { getOrCreateSessionId, getSessionId, SESSION_CHANGED_EVENT } from "./session";

export interface ProactiveMessage {
  sessionId?: string;
  messageId?: number;
  sender: string;
  content: string;
  createdAt?: string;
}
export const PROACTIVE_EVENT = "storeflow:proactive";

export function useProactiveStream(onMessage: (m: ProactiveMessage) => void) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let generation = 0;
    let currentSession: string | null = null;
    let recovering = false;
    const seen = new Set<string>();
    const deliver = (data: ProactiveMessage, sessionId: string) => {
      if (closed || sessionId !== currentSession || sessionId !== getSessionId() || data.sender !== "AI_PROACTIVE") return;
      const key = `${sessionId}:${data.messageId ?? `${data.content}|${data.createdAt}`}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (seen.size > 200) seen.delete(seen.values().next().value!);
      const message = { ...data, sessionId };
      onMessageRef.current(message);
      window.dispatchEvent(new CustomEvent(PROACTIVE_EVENT, { detail: message }));
    };
    // SSE에는 재접속 시 이력 재전송이 없다. 인증된 대화 조회로 놓친 알림을 보완한다.
    const recover = async () => {
      const id = currentSession, revision = generation, owner = getAccessToken();
      if (!id || recovering || document.visibilityState !== "visible") return;
      recovering = true;
      try {
        const messages = await apiFetch<ProactiveMessage[]>(`/api/chat/sessions/${encodeURIComponent(id)}/messages`, {
          headers: owner ? {} : { "X-Chat-Client-Id": getClientId() },
        });
        if (closed || revision !== generation || owner !== getAccessToken()) return;
        messages.filter(m => m.sender === "AI_PROACTIVE").slice(-50).forEach(m => deliver(m, id));
      } catch { /* 연결 복구 후 다시 조회한다. 조회 실패로 기존 배지를 지우지 않는다. */ }
      finally { recovering = false; }
    };
    const connect = async () => {
      const revision = generation;
      const id = await getOrCreateSessionId();
      if (closed || revision !== generation || id !== getSessionId()) return;
      if (es && currentSession === id) return;
      es?.close(); currentSession = id;
      es = new EventSource(`${API_BASE_URL}/api/realtime/stream?sessionId=${encodeURIComponent(id)}`);
      es.addEventListener("chat_message", ev => {
        try { deliver(JSON.parse((ev as MessageEvent).data), id); } catch { /* invalid frame */ }
      });
      es.addEventListener("open", () => void recover());
      void recover();
    };
    const reconnect = () => {
      generation++; es?.close(); es = null; currentSession = null; seen.clear();
      void connect().catch(() => undefined);
    };
    const onStorage = (e: StorageEvent) => { if (e.key === "storeflow_active_session_id" || e.key === null) reconnect(); };
    const refresh = () => { if (!es) void connect().catch(() => undefined); else void recover(); };
    void connect().catch(() => undefined);
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("storage", onStorage);
    window.addEventListener(SESSION_CHANGED_EVENT, reconnect);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      closed = true; generation++; es?.close(); window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SESSION_CHANGED_EVENT, reconnect);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
}
