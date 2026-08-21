// components/layout/ai-panel.tsx
// ✅ 데스크톱 전용 진짜 분할 패널(position:fixed 아님 — flex 형제로 main 옆에 나란히 배치되어
//   main이 실제로 좁아짐). 내부 로직을 AiChatBody로 교체해서 실제 채팅이 됩니다.
"use client";

import { X } from "lucide-react";
import { useAiPanel } from "./ai-panel-context";
import { AiChatBody } from "@/components/ai/ai-chat-body";

export function AiPanel() {
  const { isOpen, close } = useAiPanel();

  if (!isOpen) return null;

  return (
    <aside className="hidden w-[420px] shrink-0 flex-col border-l border-border bg-background md:flex">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <span className="text-lg font-semibold">AI에게 물어보기</span>
        <button type="button" onClick={close} aria-label="AI 패널 닫기">
          <X size={18} />
        </button>
      </div>
      <AiChatBody />
    </aside>
  );
}
