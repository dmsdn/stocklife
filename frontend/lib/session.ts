// lib/session.ts
"use client";

import { apiFetch, getAccessToken } from "./api-client";
import { getClientId } from "./client-id";

const SESSION_KEY = "storeflow_active_session_id";

export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export async function getOrCreateSessionId(): Promise<string> {
  const existing = getSessionId();
  if (existing) return existing;
  return startNewSession();
}

export async function startNewSession(): Promise<string> {
  const headers: Record<string, string> = {};
  if (!getAccessToken()) {
    headers["X-Chat-Client-Id"] = getClientId();
  }
  const res = await apiFetch<{ sessionId: string }>("/api/chat/sessions", {
    method: "POST",
    headers,
  });
  window.localStorage.setItem(SESSION_KEY, res.sessionId);
  return res.sessionId;
}

/** ✅ 신규 — 히스토리(저장 화면 AI 대화 탭)에서 과거 세션을 골라 열 때, 그 세션을
 *  "지금 활성 세션"으로 지정. 이후 getOrCreateSessionId()도 이 값을 씀. */
export function setActiveSessionId(sessionId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, sessionId);
}
