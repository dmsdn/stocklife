// components/ai/ai-chat-panel.tsx
// ✅ 실제 로직은 전부 ai-chat-body.tsx로 옮기고, 여기는 다이얼로그 껍데기만 담당합니다.
// props는 이전과 동일(open/onClose/pageContext)이라 home-ai-header.tsx, app/(main)/page.tsx는
// 그대로 동작합니다.
"use client";

import { X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AiChatBody } from "./ai-chat-body";

interface AiChatPanelProps {
  open: boolean;
  onClose: () => void;
  pageContext?: string;
}

export function AiChatPanel({ open, onClose, pageContext }: AiChatPanelProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-md flex-col p-0 md:h-[600px]">
        <div className="flex items-center justify-between border-b border-border p-4">
          <span className="text-base font-medium">AI에게 물어보기</span>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <AiChatBody
          greeting={
            pageContext
              ? "안녕하세요, 무엇을 도와드릴까요? (지금 보고 계신 화면을 참고해서 답할게요)"
              : undefined
          }
        />
      </DialogContent>
    </Dialog>
  );
}
