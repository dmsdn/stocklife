"use client";

import { createContext, useContext, useState } from "react";

interface AiPanelState {
  isOpen: boolean;
  initialMessage: string;
  open: (prompt?: string) => void;
  close: () => void;
  toggle: () => void;
}

const AiPanelContext = createContext<AiPanelState | null>(null);

export function AiPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");

  const open = (prompt?: string) => {
    setInitialMessage(prompt ?? "");
    setIsOpen(true);
  };
  const close = () => setIsOpen(false);
  const toggle = () => {
    setIsOpen((v) => {
      const next = !v;
      if (next) setInitialMessage(""); // 헤더로 그냥 열 땐 이전에 남아있던 프롬프트 안 딸려오게
      return next;
    });
  };

  return (
    <AiPanelContext.Provider value={{ isOpen, initialMessage, open, close, toggle }}>
      {children}
    </AiPanelContext.Provider>
  );
}

export function useAiPanel() {
  const ctx = useContext(AiPanelContext);
  if (!ctx) throw new Error("useAiPanel은 AiPanelProvider 안에서만 사용 가능합니다");
  return ctx;
}
