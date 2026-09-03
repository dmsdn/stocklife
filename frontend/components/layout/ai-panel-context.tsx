"use client";

import { createContext, useContext, useState } from "react";

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

  const open = (prompt?: string, targetGroupId?: number) => {
    setInitialMessage(prompt ?? "");
    setGroupId(targetGroupId ?? null);
    setSessionId(null);
    setHighlightMessageId(null);
    setIsOpen(true);
  };
  const openSession = (targetSessionId: string, targetHighlightMessageId?: number) => {
    setInitialMessage("");
    setGroupId(null);
    setSessionId(targetSessionId);
    setHighlightMessageId(targetHighlightMessageId ?? null);
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
      }
      return next;
    });
  };

  return (
    <AiPanelContext.Provider
      value={{ isOpen, initialMessage, groupId, sessionId, highlightMessageId, open, openSession, close, toggle }}
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
