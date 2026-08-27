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
  open: (prompt?: string, groupId?: number) => void;
  close: () => void;
  toggle: () => void;
}

const AiPanelContext = createContext<AiPanelState | null>(null);

export function AiPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);

  const open = (prompt?: string, targetGroupId?: number) => {
    setInitialMessage(prompt ?? "");
    setGroupId(targetGroupId ?? null);
    setIsOpen(true);
  };
  const close = () => setIsOpen(false);
  const toggle = () => {
    setIsOpen((v) => {
      const next = !v;
      if (next) {
        // 헤더로 그냥 열 땐 이전에 남아있던 프롬프트/리스트 연결 안 딸려오게
        setInitialMessage("");
        setGroupId(null);
      }
      return next;
    });
  };

  return (
    <AiPanelContext.Provider value={{ isOpen, initialMessage, groupId, open, close, toggle }}>
      {children}
    </AiPanelContext.Provider>
  );
}

export function useAiPanel() {
  const ctx = useContext(AiPanelContext);
  if (!ctx) throw new Error("useAiPanel은 AiPanelProvider 안에서만 사용 가능합니다");
  return ctx;
}
