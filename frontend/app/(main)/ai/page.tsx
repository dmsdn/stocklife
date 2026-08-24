// app/(main)/ai/page.tsx
// ✅ 데스크톱에서는 이 라우트 자체가 존재하면 안 됩니다(오른쪽 분할 패널이 그 역할을 대신함) —
//   그래서 데스크톱 폭이 되면 자동으로 "/"로 돌아가고 패널이 대신 열립니다. 모바일에서만
//   이 페이지가 실제 채팅 화면 역할을 합니다.
"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { SwipeNav } from "@/components/layout/swipe-nav";
import { AiChatBody } from "@/components/ai/ai-chat-body";
import { useAiPanel } from "@/components/layout/ai-panel-context";
import { useMediaQuery } from "@/lib/use-media-query";

function AiPageBody() {
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get("session") ?? undefined;
  const { initialMessage } = useAiPanel();

  return (
    <AiChatBody
      sessionIdOverride={requestedSessionId}
      initialMessage={initialMessage}
      greeting={"안녕하세요 OO님,\n어떤 주제로 시작해볼까요?"}
    />
  );
}

export default function AiPage() {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { open } = useAiPanel();

  useEffect(() => {
    // ✅ 데스크톱 폭에서 이 라우트로 들어오면(주소 직접 입력, 모바일→웹 리사이즈 등)
    //   왼쪽엔 홈이 보이고 AI챗은 오른쪽 패널로 대신 열리게 함
    if (isDesktop) {
      open();
      router.replace("/");
    }
  }, [isDesktop, open, router]);

  if (isDesktop) return null;

  return (
    // ✅ position:fixed로 뷰포트에 직접 고정 — AppShell의 main(pb 등) 영향을 전혀 받지 않음.
    //   top:0 ~ bottom:(하단탭바 높이) 사이 딱 그 공간만 차지하니 헤더 높이가 몇 px이든,
    //   조상 쪽 padding이 얼마든 절대 뷰포트보다 커질 수 없어서 전체 스크롤이 생기지 않는다.
    //   (메시지 목록만 AiChatBody 내부에서 자체 스크롤됨)
    <div className="fixed inset-x-0 top-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex flex-col overflow-hidden bg-background md:hidden">
      <HomeAiHeader active="ai" />

      <SwipeNav current={1} className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<div className="flex-1" />}>
          <AiPageBody />
        </Suspense>
      </SwipeNav>
    </div>
  );
}
