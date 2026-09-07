// lib/realtime.ts
// ✅ 신규(09-03 요청 ①) — 자발형 말풍선 수신. 백엔드 GET /api/realtime/stream?sessionId=
//   (SSE)를 앱 셸에서 하나 구독합니다. 에이전트가 먼저 말을 걸면(진입 브리핑·재고 전환·
//   망설임 개입) 백엔드 EventBroadcastService가 chat_message를 저장하고 이 스트림으로
//   같은 내용을 방송하는데, 지금까지 받는 쪽이 없어서 "패널을 다시 열어야" 보였습니다.
//   받은 건 window 커스텀 이벤트 "storeflow:proactive"로 흘립니다 — 열려 있는
//   AiChatBody가 그걸 받아 바로 붙이고(요청 ③), 닫혀 있으면 헤더 배지가 셉니다(요청 ②).
//   EventSource는 커스텀 헤더를 못 붙여서(Authorization 등), sessionId만으로 구독합니다
//   (백엔드 설계가 원래 그렇게 돼 있음 — chat_session이 회원/게스트 둘 다 커버).
"use client";

import { useEffect } from "react";
import { API_BASE_URL } from "./api-client";
import { getOrCreateSessionId, SESSION_CHANGED_EVENT } from "./session";

export interface ProactiveMessage {
  messageId?: number;
  sender: string;
  content: string;
  createdAt?: string;
}

export const PROACTIVE_EVENT = "storeflow:proactive";

export function useProactiveStream(onMessage: (m: ProactiveMessage) => void) {
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let currentSession: string | null = null;

    const connect = async () => {
      const sessionId = await getOrCreateSessionId();
      if (closed) return;
      if (es && currentSession === sessionId) return; // 이미 같은 세션에 붙어있으면 재연결 불필요
      es?.close();
      currentSession = sessionId;
      es = new EventSource(`${API_BASE_URL}/api/realtime/stream?sessionId=${encodeURIComponent(sessionId)}`);
      es.addEventListener("chat_message", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as ProactiveMessage;
          if (data.sender !== "AI_PROACTIVE") return; // 내가 물어본 답은 /api/chat 응답으로 이미 그렸음
          onMessage(data);
          window.dispatchEvent(new CustomEvent(PROACTIVE_EVENT, { detail: data }));
        } catch {
          /* 깨진 프레임은 버림 */
        }
      });
      // 브라우저 EventSource는 연결이 끊기면 스스로 재접속합니다. 세션이 바뀌면(새 대화
      // 시작·다른 대화로 전환) 아래 두 리스너 중 하나가 잡아서 다시 붙입니다.
    };
    connect();

    // ✅ 다른 탭에서 세션이 바뀐 경우(브라우저 기본 storage 이벤트 — 지금 이 탭 자신이
    //   바꾼 건 여기로 안 옴)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "storeflow_active_session_id" && e.newValue) connect();
    };
    // ✅ 지금 이 탭에서 세션이 바뀐 경우(lib/session.ts가 쏘는 커스텀 이벤트)
    const onSessionChanged = () => connect();

    window.addEventListener("storage", onStorage);
    window.addEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
    return () => {
      closed = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
