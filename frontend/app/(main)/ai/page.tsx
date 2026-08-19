// app/(main)/ai/page.tsx
// ✅ 채팅 로직을 components/ai/ai-chat-body.tsx로 옮기고, 이 파일은 홈/AI 헤더 +
//   스와이프 네비게이션 + ?session= 쿼리 처리만 담당하도록 줄였습니다.
"use client";

import { useSearchParams } from "next/navigation";
import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { SwipeNav } from "@/components/layout/swipe-nav";
import { AiChatBody } from "@/components/ai/ai-chat-body";

export default function AiPage() {
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get("session") ?? undefined;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <HomeAiHeader active="ai" />

      <SwipeNav current={1}>
        <div className="flex h-[calc(100dvh-72px)] flex-col">
          <AiChatBody
            sessionIdOverride={requestedSessionId}
            greeting={"안녕하세요 OO님,\n어떤 주제로 시작해볼까요?"}
          />
        </div>
      </SwipeNav>
    </div>
  );
}
