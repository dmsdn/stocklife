// components/ai/ai-chat-panel.tsx
// ✅ 모바일에서는 화면 전체를 덮는 다이얼로그로, 데스크톱(md 이상)에서는 화면을 가리지 않고
//   오른쪽을 분할해서 떠 있는 패널로 렌더링합니다. props(open/onClose/pageContext)는
//   그대로라 호출부(home-ai-header.tsx 등)는 안 건드려도 됩니다.
"use client";

import { X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AiChatBody } from "./ai-chat-body";
import { useMediaQuery } from "@/lib/use-media-query";

interface AiChatPanelProps {
  open: boolean;
  onClose: () => void;
  pageContext?: string;
}

export function AiChatPanel({ open, onClose, pageContext }: AiChatPanelProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const greeting = pageContext
    ? "안녕하세요, 무엇을 도와드릴까요? (지금 보고 계신 화면을 참고해서 답할게요)"
    : undefined;

  if (!open) return null;

  if (isDesktop) {
    // 데스크톱 — 화면을 가리지 않고 오른쪽에 분할된 패널로
    return (
      <div className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <span className="text-base font-medium">AI에게 물어보기</span>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <AiChatBody greeting={greeting} />
      </div>
    );
  }

  // 모바일 — 화면 전체를 채우는 AI챗 화면
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col rounded-none border-none p-0">
        <div className="flex items-center justify-between border-b border-border p-4">
          <span className="text-base font-medium">AI에게 물어보기</span>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <AiChatBody greeting={greeting} />
      </DialogContent>
    </Dialog>
  );
}
