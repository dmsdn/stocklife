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
  if (existing) {
    // ✅ 버그 수정(요청 — "채팅 리스트·상세 링크·리브 추천") — localStorage에 저장된
    //   "지금 활성 세션"은 브라우저 전체(모든 탭)가 공유합니다. 예전엔 이 세션이 실제로
    //   있기만 하면(404만 아니면) 무조건 재사용했는데, 그러면 A 리스트에서 시작한 대화를
    //   B 리스트 화면에서 "리브에게 물어보기"로 열었을 때도 A의 대화가 그대로 재사용돼서
    //   엉뚱한 리스트로 메시지가 갔습니다. 이제 이 세션이 실제로 연결된 groupId를 먼저
    //   확인해서, 요청한 groupId와 다르면 재사용하지 않고 그 groupId로 새로 만듭니다.
    try {
      const metadata = await getSessionMetadata(existing);
      if (groupId != null && metadata.groupId !== groupId) return startNewSession(groupId);
      return existing;
    } catch {
      // 조회 자체가 실패(세션이 없어졌거나 네트워크 문제)하면 새로 만듭니다.
      return startNewSession(groupId);
    }
  }
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
 *  더 시도합니다 — 호출부는 "혹시 세션이 무효할 수도 있다"를 신경 쓸 필요가 없어짐.
 *
 *  ✅ 수정(버그 수정 — "다른 창에서 활성 채팅 ID가 바뀌면 메시지가 다른 채팅으로 감") —
 *  세 번째 인자 boundSessionId를 넘기면, 그 화면(예: 열려있는 AI 패널 하나)이 "이미
 *  확정해서 고정해둔" 세션 id를 그대로 씁니다 — getOrCreateSessionId()가 다시 읽는
 *  localStorage 전역 값(다른 탭/패널이 바꿨을 수 있음)을 무시합니다. boundSessionId가
 *  이미 지워진 대화(404)면, 다른 대화로 조용히 넘기지 않고 그대로 실패시킵니다 — 화면이
 *  "고정"해둔 대화가 사라졌으면 그 화면 자체가 다시 로드되면서 새 세션을 잡아야 하는
 *  상황이지, 여기서 임의로 다른 대화에 보낼 상황이 아니기 때문입니다. */
export async function withValidSession<T>(
  groupId: number | null | undefined,
  run: (sessionId: string) => Promise<T>,
  boundSessionId?: string | null
): Promise<T> {
  if (boundSessionId) {
    // 고정된 세션은 그대로 사용 — 없어졌으면(404 등) 그대로 에러를 던짐(다른 세션으로 재시도 안 함).
    return run(boundSessionId);
  }
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

/** ✅ 신규 — 세션 id 하나의 메타데이터(연결된 groupId 포함)만 가볍게 조회. */
export async function getSessionMetadata(sessionId: string): Promise<{ sessionId: string; groupId: number | null }> {
  const headers: Record<string, string> = {};
  if (!getAccessToken()) headers["X-Chat-Client-Id"] = getClientId();
  return apiFetch<{ sessionId: string; groupId: number | null }>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}`,
    { headers }
  );
}

/** ✅ 신규 — 히스토리(저장 화면 AI 대화 탭)에서 과거 세션을 골라 열 때, 그 세션을
 *  "지금 활성 세션"으로 지정. 이후 getOrCreateSessionId()도 이 값을 씀. */
export function setActiveSessionId(sessionId: string) {
  if (typeof window === "undefined") return;
  writeSessionId(sessionId);
}
