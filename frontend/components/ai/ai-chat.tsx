// components/ai/ai-chat.tsx
// ✅ 원래 993줄짜리 독립 구현이었는데, ai-chat-panel.tsx와 로직이 사실상 같아서
//   ai-chat-body.tsx 공용 컴포넌트를 쓰는 전체화면 래퍼로 줄였습니다.
// ⚠ 여전히 이 컴포넌트를 직접 쓰는 곳은 없습니다(app/(main)/ai/page.tsx가 같은 목적을
//   이미 담당). 전체화면 형태로 어딘가에 다시 쓰고 싶으시면 이 컴포넌트를 그대로 불러쓰면 됩니다.
"use client";

import { RiArrowLeftSLine } from "@remixicon/react";
import { AiChatBody, type AiChatBodyProps } from "./ai-chat-body";

interface AiChatProps extends AiChatBodyProps {
  onBack?: () => void;
}

export function AiChat({ onBack, ...bodyProps }: AiChatProps) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 p-4">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="뒤로가기">
            <RiArrowLeftSLine size={24} />
          </button>
        )}
        <span className="text-base">AI에게 물어보기</span>
      </div>
      <AiChatBody {...bodyProps} />
    </div>
  );
}
