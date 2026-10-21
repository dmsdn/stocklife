// components/ai/ai-chat-panel.tsx
// 모바일에서는 화면 전체를 덮는 다이얼로그로,
// 데스크톱(md 이상)에서는 브라우저 viewport 오른쪽에 고정된 패널로 렌더링합니다.

"use client";

import { RiCloseLine } from "@remixicon/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AiChatBody } from "./ai-chat-body";
import { useMediaQuery } from "@/lib/use-media-query";

interface AiChatPanelProps {
  open: boolean;
  onClose: () => void;
  pageContext?: string;
}

export function AiChatPanel({
  open,
  onClose,
  pageContext,
}: AiChatPanelProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const greeting = pageContext
    ? "안녕하세요, 무엇을 도와드릴까요? (지금 보고 계신 화면을 참고해서 답할게요)"
    : undefined;

  if (!open) return null;

  if (isDesktop) {
    // 데스크톱
    // 왼쪽 페이지의 높이/스크롤과 관계없이 viewport 전체 높이에 고정
    return (
      <div className="fixed inset-y-0 right-0 z-50 flex h-dvh min-h-0 w-[420px] min-w-0 flex-col overflow-hidden border-l border-border bg-background shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <span className="text-base font-medium">
            AI에게 물어보기
          </span>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
          >
            <RiCloseLine size={24} />
          </button>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <AiChatBody greeting={greeting} />
        </div>
      </div>
    );
  }

  // 모바일
  // viewport 전체를 사용하고, 패널 자체에는 스크롤이 생기지 않도록 함
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
    >
      <DialogContent
        className="
          flex
          h-dvh
          max-h-dvh
          min-h-0
          w-full
          max-w-none
          flex-col
          overflow-hidden
          rounded-none
          border-none
          p-0
        "
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <span className="text-base font-medium">
            AI에게 물어보기
          </span>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
          >
            <RiCloseLine size={24} />
          </button>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <AiChatBody greeting={greeting} />
        </div>
      </DialogContent>
    </Dialog>
  );
}