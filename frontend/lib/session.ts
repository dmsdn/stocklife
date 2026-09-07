// lib/session.ts
"use client";

import { apiFetch, getAccessToken, ApiError } from "./api-client";
import { getClientId } from "./client-id";

const SESSION_KEY = "storeflow_active_session_id";
/** ✅ 신규(09-03 요청 ①) — 세션 id가 바뀔 때마다 쏘는 커스텀 이벤트. 브라우저 기본
 *  storage 이벤트는 "다른 탭"에서만 발생해서(같은 탭에서 바뀐 건 그 탭 자신은 못 받음),
 *  lib/realtime.ts가 "지금 이 탭에서 새 세션이 생겼을 때"도 재구독하려면 이게 필요함. */
export const SESSION_CHANGED_EVENT = "storeflow:session-changed";

function writeSessionId(sessionId: string) {
  // ✅ 수정(요청 — 중복 알림 원인 조사) — 실제로 값이 안 바뀌었는데도(예: ai-chat-body.tsx가
  //   매 로드마다 setActiveSessionId(sessionIdOverride)를 다시 부름) 이벤트를 계속 쏘면
  //   lib/realtime.ts가 불필요하게 재연결을 시도합니다. 값이 실제로 바뀔 때만 쏨.
  if (window.localStorage.getItem(SESSION_KEY) === sessionId) return;
  window.localStorage.setItem(SESSION_KEY, sessionId);
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: sessionId }));
}

export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export async function getOrCreateSessionId(groupId?: number | null): Promise<string> {
  const existing = getSessionId();
  if (existing) return existing;
  return startNewSession(groupId);
}

/** @param groupId 특정 리스트에서 시작한 대화면 그 리스트 id를 넘깁니다 — chat_session.group_id로
 *  저장돼서, 나중에 그 리스트 화면에서 "이어서 물어보기"로 이어집니다. */
export async function startNewSession(groupId?: number | null): Promise<string> {
  const headers: Record<string, string> = {};
  if (!getAccessToken()) {
    headers["X-Chat-Client-Id"] = getClientId();
  }
  const res = await apiFetch<{ sessionId: string }>("/api/chat/sessions", {
    method: "POST",
    headers,
    body: groupId ? JSON.stringify({ groupId }) : undefined,
  });
  writeSessionId(res.sessionId);
  return res.sessionId;
}

/** ✅ 신규 — 리브가 계속 답을 못 받아오던 원인: localStorage에 저장된 세션 id가 있으면
 *  getOrCreateSessionId()가 그게 백엔드에 실제로 있는지 확인도 안 하고 그대로 재사용했음.
 *  로컬 DB가 리셋되거나(H2 in-memory 등) 세션이 지워지면, 그 이후로는 존재하지 않는
 *  세션 id를 영원히 계속 붙잡고 있어서 /api/chat/sessions/{id}(/messages)가 매번 404 —
 *  화면엔 그냥 빈 대화창만 뜨고, 메시지를 보내도 응답을 못 받는 것처럼 보였던 것.
 *  이 함수로 감싼 요청이 404로 실패하면, 그 세션 id를 버리고 새 세션을 만들어서 한 번
 *  더 시도합니다 — 호출부는 "혹시 세션이 무효할 수도 있다"를 신경 쓸 필요가 없어짐. */
export async function withValidSession<T>(
  groupId: number | null | undefined,
  run: (sessionId: string) => Promise<T>
): Promise<T> {
  const sessionId = await getOrCreateSessionId(groupId);
  try {
    return await run(sessionId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      window.localStorage.removeItem(SESSION_KEY);
      const freshSessionId = await startNewSession(groupId);
      return run(freshSessionId);
    }
    throw e;
  }
}

/** ✅ 신규 — 히스토리(저장 화면 AI 대화 탭)에서 과거 세션을 골라 열 때, 그 세션을
 *  "지금 활성 세션"으로 지정. 이후 getOrCreateSessionId()도 이 값을 씀. */
export function setActiveSessionId(sessionId: string) {
  if (typeof window === "undefined") return;
  writeSessionId(sessionId);
}
