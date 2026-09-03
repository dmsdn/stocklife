// lib/session-title-override.ts
// ⚠ 백엔드에 채팅 세션 "이름 수정" API(예: PATCH /api/chat/sessions/{sessionId})가 아직
//   없습니다(있는 건 GET/생성뿐 — ChatSession.setTitleIfEmpty()는 첫 메시지로 딱 한 번
//   자동으로만 채워지고, 그 뒤엔 절대 안 바뀜). 백엔드 팀에 별도로 요청 문서를 전달했고,
//   그 API가 생기면 이 파일의 writeOverride/readOverride를 실제 PATCH 호출로 바꾸고
//   이 로컬 오버레이는 지우면 됩니다.
//   그때까지는 "이 기기 이 브라우저에서만" 이름이 바뀐 것처럼 보이는 임시 저장소입니다
//   (localStorage) — 다른 기기/브라우저에서는 서버 기본 제목(title)이 그대로 보입니다.
"use client";

const KEY = "storeflow_chat_title_overrides";

function readAll(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getSessionTitleOverride(sessionId: string): string | null {
  return readAll()[sessionId] ?? null;
}

export function setSessionTitleOverride(sessionId: string, title: string) {
  if (typeof window === "undefined") return;
  const all = readAll();
  const trimmed = title.trim();
  if (!trimmed) {
    delete all[sessionId];
  } else {
    all[sessionId] = trimmed;
  }
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

/** 서버 title과 로컬 오버레이 중 오버레이가 있으면 그걸 우선 사용. */
export function resolveSessionTitle(sessionId: string, serverTitle: string | null | undefined): string {
  return getSessionTitleOverride(sessionId) ?? serverTitle ?? "한 줄 요약";
}
