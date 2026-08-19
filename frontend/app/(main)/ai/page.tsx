// app/(main)/ai/page.tsx

"use client";

import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { SwipeNav } from "@/components/layout/swipe-nav";
import { AiChatPanel } from "@/components/ai/ai-chat-panel";

export default function AiPage() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <HomeAiHeader active="ai" />

      <SwipeNav current={1}>
        <div className="min-h-full" />
      </SwipeNav>

      {/* AI 페이지에서는 처음부터 오른쪽 패널이 열린 상태 */}
      <AiChatPanel
        onClose={() => {
          window.history.back();
        } } open={false}      />
    </div>
  );
}