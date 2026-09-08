// lib/hidden-sessions.ts
// ✅ 신규(요청 6번 — "리브 기록 꾹 누르면 삭제할 수 있게") — 백엔드 채팅 세션 API에
//   DELETE 엔드포인트가 없습니다(PATCH로 이름 변경만 가능). 그래서 완료된 리스트를
//   가리는 lib/completed-groups.ts와 같은 방식으로, "이 기기에서 목록에 안 보이게"만
//   하는 로컬 플래그로 처리합니다 — 실제 서버 데이터는 안 지워집니다(다른 기기/브라우저
//   에서는 계속 보임). 백엔드에 DELETE /api/chat/sessions/{sessionId}가 생기면 이 파일
//   대신 그걸 쓰면 됩니다.
"use client";

const KEY = "storeflow_hidden_sessions";

function readAll(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function hideSession(sessionId: string) {
  const all = new Set(readAll());
  all.add(sessionId);
  window.localStorage.setItem(KEY, JSON.stringify(Array.from(all)));
}

export function isSessionHidden(sessionId: string): boolean {
  return readAll().includes(sessionId);
}
