"use client";

import { createContext, useContext, useState } from "react";

interface AiPanelState {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const AiPanelContext = createContext<AiPanelState | null>(null);

export function AiPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <AiPanelContext.Provider
      value={{ isOpen, toggle: () => setIsOpen((v) => !v), close: () => setIsOpen(false) }}
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
