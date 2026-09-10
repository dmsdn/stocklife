// lib/realtime.ts
// ✅ 신규(09-03 요청 ①) — 자발형 말풍선 수신. 백엔드 GET /api/realtime/stream?sessionId=
//   (SSE)를 앱 셸에서 하나 구독합니다. 에이전트가 먼저 말을 걸면(진입 브리핑·재고 전환·
//   망설임 개입) 백엔드 EventBroadcastService가 chat_message를 저장하고 이 스트림으로
//   같은 내용을 방송하는데, 지금까지 받는 쪽이 없어서 "패널을 다시 열어야" 보였습니다.
//   받은 건 window 커스텀 이벤트 "storeflow:proactive"로 흘립니다 — 열려 있는
//   AiChatBody가 그걸 받아 바로 붙이고(요청 ③), 닫혀 있으면 헤더 배지가 셉니다(요청 ②).
//   EventSource는 커스텀 헤더를 못 붙여서(Authorization 등), sessionId만으로 구독합니다
//   (백엔드 설계가 원래 그렇게 돼 있음 — chat_session이 회원/게스트 둘 다 커버).
// ✅ 수정(요청 — "계속 같은 알림을 보내는 것 같다") — 원인: 브라우저 EventSource는 연결이
//   끊기면 스스로 재접속하는데(예: 세션 재확인·탭 포커스 전환 등으로 이 훅이 다시 실행될
//   때), 재접속 시점에 백엔드가 "최근 메시지"를 다시 흘려보내는 SSE 구현이면 같은
//   messageId가 두 번 이상 onMessage로 들어올 수 있습니다. 여기서 한 번 본 메시지는
//   (messageId 기준, 없으면 content+createdAt 기준) 다시 처리하지 않도록 걸러서, 이
//   훅을 쓰는 쪽(배지 카운트·알림함 저장·채팅 말풍선) 전부가 한 번만 반영되게 합니다.
"use client";

import { useEffect, useRef } from "react";
import { API_BASE_URL } from "./api-client";
import { getOrCreateSessionId, SESSION_CHANGED_EVENT } from "./session";

export interface ProactiveMessage {
  /** ✅ 신규(버그 수정 — "다른 창의 세션 이벤트가 이 채팅에도 반영됨") — 이 이벤트가
   *  어느 세션 구독에서 온 건지. ai-chat-body.tsx가 자기 boundSession과 다르면 무시. */
  sessionId?: string;
  messageId?: number;
  sender: string;
  content: string;
  createdAt?: string;
}

export const PROACTIVE_EVENT = "storeflow:proactive";

function dedupeKey(m: ProactiveMessage): string {
  return m.messageId != null ? `id:${m.messageId}` : `c:${m.content}|${m.createdAt ?? ""}`;
}

export function useProactiveStream(onMessage: (m: ProactiveMessage) => void) {
  // ✅ 이 컴포넌트(앱 셸)가 떠 있는 동안 계속 유지 — 재연결이 여러 번 일어나도 한 번
  //   본 메시지는 계속 기억함. 너무 커지지 않게 최근 200개까지만.
  const seenRef = useRef<Set<string>>(new Set());
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

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
          data.sessionId = sessionId;
          if (data.sender !== "AI_PROACTIVE") return; // 내가 물어본 답은 /api/chat 응답으로 이미 그렸음

          const key = dedupeKey(data);
          if (seenRef.current.has(key)) return; // ✅ 재연결로 같은 메시지가 다시 와도 무시
          seenRef.current.add(key);
          if (seenRef.current.size > 200) {
            const first = seenRef.current.values().next().value;
            if (first) seenRef.current.delete(first);
          }

          onMessageRef.current(data);
          window.dispatchEvent(new CustomEvent(PROACTIVE_EVENT, { detail: data }));
        } catch {
          /* 깨진 프레임은 버림 */
        }
      });
      // 브라우저 EventSource는 연결이 끊기면 스스로 재접속합니다. 세션이 바뀌면(새 대화
      // 시작·다른 대화로 전환) 아래 두 리스너 중 하나가 잡아서 다시 붙입니다.
    };
    const reconnect = () => void connect().catch(() => undefined);
    reconnect();

    // ✅ 다른 탭에서 세션이 바뀐 경우(브라우저 기본 storage 이벤트 — 지금 이 탭 자신이
    //   바꾼 건 여기로 안 옴)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "storeflow_active_session_id") onSessionChanged();
    };
    // ✅ 지금 이 탭에서 세션이 바뀐 경우(lib/session.ts가 쏘는 커스텀 이벤트)
    const onSessionChanged = () => { es?.close(); es = null; seenRef.current.clear(); reconnect(); };

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
