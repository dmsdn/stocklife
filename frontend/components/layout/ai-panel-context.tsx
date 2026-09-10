"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AUTH_CHANGED_EVENT } from "@/lib/api-client";

interface AiPanelState {
  isOpen: boolean;
  initialMessage: string;
  /** ✅ 신규 — 리스트 화면에서 "AI에게 물어보기"로 열면 그 리스트 id가 담깁니다.
   *  AiChatBody가 새 세션을 만들 때 이 값을 같이 보내서, chat_session.group_id로
   *  이어집니다(백엔드에 group_id 컬럼은 이미 추가됨 — 컨트롤러가 이 필드를 받는지는
   *  별도 확인 필요). 헤더/홈처럼 리스트랑 무관하게 연 대화는 null. */
  groupId: number | null;
  /** ✅ 신규(2026-09) — 예전엔 특정 세션을 이어보려면 /ai?session=... 라우트로 이동해야
   *  했는데, 이제 "리브 페이지"(그 라우트 전체)가 없어져서 모달이 어떤 세션을 보여줄지도
   *  이 컨텍스트가 들고 있어야 함. null이면 AiChatBody가 새 세션을 만든다. */
  sessionId: string | null;
  /** ✅ 신규 — 대화 검색(기록 > 리브)에서 특정 메시지로 스크롤 이동할 때만 채워짐. */
  highlightMessageId: number | null;
  /** ✅ 신규(09-03 요청 ②) — 패널이 닫혀 있는 동안 도착한 자발형(AI_PROACTIVE) 말풍선
   *  개수. 헤더의 AI 아이콘에 빨간 배지로 보여줌 — "묻지 않았는데 말을 건다"가
   *  패널을 안 열어도 보여야 하니까. 열면(open/openSession/toggle로 열릴 때) 0으로. */
  unread: number;
  /** ✅ 신규 — lib/realtime.ts가 자발형 메시지를 받을 때마다 호출. 패널이 이미 열려
   *  있으면 셀 필요 없음(AiChatBody가 바로 붙여서 보여주니까). */
  bumpUnread: () => void;
  clearUnread: () => void;
  /** 새 대화(또는 특정 프롬프트로 시작하는 대화)를 엶. sessionId는 항상 초기화됨. */
  open: (prompt?: string, groupId?: number) => void;
  /** ✅ 신규 — 이미 있는 대화(세션)를 이어서 엶. */
  openSession: (sessionId: string, highlightMessageId?: number) => void;
  close: () => void;
  toggle: () => void;
}

const AiPanelContext = createContext<AiPanelState | null>(null);

export function AiPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const reset = () => {
      setIsOpen(false); setInitialMessage(""); setGroupId(null);
      setSessionId(null); setHighlightMessageId(null); setUnread(0);
    };
    window.addEventListener(AUTH_CHANGED_EVENT, reset);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, reset);
  }, []);

  const open = (prompt?: string, targetGroupId?: number) => {
    setInitialMessage(prompt ?? "");
    setGroupId(targetGroupId ?? null);
    setSessionId(null);
    setHighlightMessageId(null);
    setUnread(0);
    setIsOpen(true);
  };
  const openSession = (targetSessionId: string, targetHighlightMessageId?: number) => {
    setInitialMessage("");
    setGroupId(null);
    setSessionId(targetSessionId);
    setHighlightMessageId(targetHighlightMessageId ?? null);
    setUnread(0);
    setIsOpen(true);
  };
  const close = () => setIsOpen(false);
  const toggle = () => {
    setIsOpen((v) => {
      const next = !v;
      if (next) {
        // 헤더로 그냥 열 땐 이전에 남아있던 프롬프트/리스트/세션 연결 안 딸려오게
        setInitialMessage("");
        setGroupId(null);
        setSessionId(null);
        setHighlightMessageId(null);
        setUnread(0);
      }
      return next;
    });
  };
  // ✅ isOpen을 클로저로 직접 참조하면 Provider가 리렌더될 때마다 이 함수가 새로 만들어져야
  //   최신 isOpen을 보는데, useProactiveStream 쪽 useEffect가 처음 받은 함수를 계속 쓰므로
  //   함수형 업데이트 안에서 매번 최신 isOpen을 다시 확인하도록 setIsOpen의 콜백 형태 대신
  //   setUnread 쪽에서 직접 "지금 패널이 열려있나"를 함수형으로 판단할 수 없어(isOpen은
  //   상태 값이지 setter가 아님) — 대신 bumpUnread를 호출하는 쪽(app-shell)이 이미
  //   isOpen을 알고 있으므로 그쪽에서 열려있으면 아예 안 부르게 함. 여기선 항상 +1만.
  const bumpUnread = () => setUnread((n) => n + 1);
  const clearUnread = () => setUnread(0);

  return (
    <AiPanelContext.Provider
      value={{
        isOpen,
        initialMessage,
        groupId,
        sessionId,
        highlightMessageId,
        unread,
        bumpUnread,
        clearUnread,
        open,
        openSession,
        close,
        toggle,
      }}
    >
      {children}
    </AiPanelContext.Provider>
  );
}

export function useAiPanel() {
  const ctx = useContext(AiPanelContext);
  if (!ctx) throw new Error("useAiPanel은 AiPanelProvider 안에서만 사용 가능합니다");
  return ctx;
}
