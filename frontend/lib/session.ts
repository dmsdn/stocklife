"use client";

import { apiFetch, getAccessToken, ApiError, AUTH_CHANGED_EVENT } from "./api-client";
import { getClientId } from "./client-id";

const SESSION_KEY = "storeflow_active_session_id";
export const SESSION_CHANGED_EVENT = "storeflow:session-changed";
let revision = 0;
let pending: { key: string; request: Promise<string> } | null = null;

function identity() { return getAccessToken() ?? `guest:${getClientId()}`; }
function headers(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}
function snapshot() {
  const owner = identity(), generation = revision;
  return () => {
    if (owner !== identity() || generation !== revision)
      throw new Error("로그인 상태가 변경되어 대화를 다시 연결합니다.");
  };
}
function writeSessionId(id: string) {
  if (getSessionId() === id) return;
  window.localStorage.setItem(SESSION_KEY, id);
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: id }));
}
export function getSessionId(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(SESSION_KEY);
}
export function clearActiveSession() {
  if (typeof window === "undefined") return;
  revision += 1;
  pending = null;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: null }));
}
export async function startNewSession(groupId?: number | null): Promise<string> {
  const check = snapshot();
  const res = await apiFetch<{ sessionId: string }>("/api/chat/sessions", {
    method: "POST", headers: headers(),
    body: groupId ? JSON.stringify({ groupId }) : undefined,
  });
  check();
  writeSessionId(res.sessionId);
  return res.sessionId;
}

// 저장된 UUID만으로 소유권을 가정하지 않는다. 구버전의 잘못된 저장 상태도 검사한다.
export async function getOrCreateSessionId(groupId?: number | null): Promise<string> {
  const key = JSON.stringify([identity(), revision, groupId ?? null, getSessionId()]);
  if (pending?.key === key) return pending.request;
  const check = snapshot();
  const request = (async () => {
    const existing = getSessionId();
    if (existing) {
      try {
        const metadata = await apiFetch<{groupId?: number | null}>(`/api/chat/sessions/${encodeURIComponent(existing)}`, { headers: headers() });
        check();
        // A chat for another list is not reusable merely because the account owns it.
        if (groupId != null && metadata.groupId !== groupId) return startNewSession(groupId);
        return existing;
      } catch (e) {
        check();
        // 읽기 전용 소유권 조회의 403/404만 복구한다. 거부된 행동 요청은 재전송하지 않는다.
        if (!(e instanceof ApiError) || ![403, 404].includes(e.status)) throw e;
        if (getSessionId() !== existing) throw new Error("대화가 변경되었습니다. 다시 시도해 주세요.");
        window.localStorage.removeItem(SESSION_KEY);
      }
    }
    check();
    return startNewSession(groupId);
  })();
  pending = { key, request };
  void request.finally(() => { if (pending?.request === request) pending = null; }).catch(() => undefined);
  return request;
}

export async function withValidSession<T>(
  groupId: number | null | undefined, run: (sessionId: string) => Promise<T>, boundSessionId?: string | null
): Promise<T> {
  const check = snapshot();
  // A mounted chat pins its own ID; another tab/panel cannot redirect its send.
  const id = boundSessionId ?? await getOrCreateSessionId(groupId);
  if (boundSessionId) await apiFetch(`/api/chat/sessions/${encodeURIComponent(id)}`, {headers: headers()});
  check();
  const result = await run(id);
  check();
  return result;
}
export async function getSessionMetadata(id: string): Promise<{sessionId: string; groupId: number | null}> {
  return apiFetch(`/api/chat/sessions/${encodeURIComponent(id)}`, {headers: headers()});
}
export function setActiveSessionId(id: string) {
  if (typeof window !== "undefined") writeSessionId(id);
}

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_CHANGED_EVENT, clearActiveSession);
  window.addEventListener("storage", (event) => {
    if (event.key === "storeflow_access_token" || event.key === null) {
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    }
  });
}
