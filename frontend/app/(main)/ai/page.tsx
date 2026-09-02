// app/(main)/ai/page.tsx
// ✅ 데스크톱에서는 이 라우트 자체가 존재하면 안 됩니다(오른쪽 분할 패널이 그 역할을 대신함) —
//   그래서 데스크톱 폭이 되면 자동으로 "/"로 돌아가고 패널이 대신 열립니다. 모바일에서만
//   이 페이지가 실제 채팅 화면 역할을 합니다.
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { SessionListDrawer } from "@/components/ai/session-list-drawer";
import { SwipeNav } from "@/components/layout/swipe-nav";
import { AiChatBody } from "@/components/ai/ai-chat-body";
import { useAiPanel } from "@/components/layout/ai-panel-context";
import { useMediaQuery } from "@/lib/use-media-query";
import { getMyProfile } from "@/lib/consumer-api";
import { isLoggedIn } from "@/lib/api-client";

function AiPageBody() {
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get("session") ?? undefined;
  const highlightParam = searchParams.get("highlight");
  const { initialMessage } = useAiPanel();

  // ✅ 참고 디자인(AI챗 화면) — "안녕하세요 {실명}님,\n리브와 함께" — 예전엔 이름 자리에
  //   고정 문자열 "OO"가 그대로 박혀 있었습니다. 홈 인사말(home-greeting.tsx)과 동일하게
  //   getMyProfile()로 실제 이름을 받아옵니다.
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) return;
    getMyProfile()
      .then((p) => setName(p.name))
      .catch(() => setName(null));
  }, []);

  return (
    <AiChatBody
      sessionIdOverride={requestedSessionId}
      initialMessage={initialMessage}
      highlightMessageId={highlightParam ? Number(highlightParam) : undefined}
      greeting={name ? `안녕하세요 ${name}님,\n리브와 함께` : "안녕하세요,\n리브와 함께"}
    />
  );
}

export default function AiPage() {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { open, close } = useAiPanel();
  const [sessionListOpen, setSessionListOpen] = useState(false);

  useEffect(() => {
    // ✅ 데스크톱 폭에서 이 라우트로 들어오면(주소 직접 입력, 모바일→웹 리사이즈 등)
    //   왼쪽엔 홈이 보이고 AI챗은 오른쪽 패널로 대신 열리게 함
    if (isDesktop) {
      open();
      router.replace("/");
    }
  }, [isDesktop, open, router]);

  // ✅ 이 라우트를 벗어날 때(하단탭으로 다른 화면 이동 등) isOpen을 꺼줍니다.
  //   안 꺼주면 ai-panel.tsx의 "모바일인데 isOpen인데 /ai가 아니다" 감지 로직이
  //   페이지 바뀔 때마다 계속 /ai로 강제로 되돌려서, 다른 하단탭이 전혀 안 눌리는
  //   문제가 있었습니다. close를 ref로 잡아서 이 effect는 마운트/언마운트 때만 동작.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    return () => closeRef.current();
  }, []);

  if (isDesktop) return null;

  return (
    // ✅ position:fixed로 뷰포트에 직접 고정 — AppShell의 main(pb 등) 영향을 전혀 받지 않음.
    //   top:0 ~ bottom:(하단탭바 높이) 사이 딱 그 공간만 차지하니 헤더 높이가 몇 px이든,
    //   조상 쪽 padding이 얼마든 절대 뷰포트보다 커질 수 없어서 전체 스크롤이 생기지 않는다.
    //   (메시지 목록만 AiChatBody 내부에서 자체 스크롤됨)
    <div className="fixed inset-x-0 top-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex flex-col overflow-hidden bg-background md:hidden">
      <HomeAiHeader active="ai" onHamburgerClick={() => setSessionListOpen(true)} />

      <SessionListDrawer open={sessionListOpen} onClose={() => setSessionListOpen(false)} />

      <SwipeNav current={1} className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<div className="flex-1" />}>
          <AiPageBody />
        </Suspense>
      </SwipeNav>
    </div>
  );
}
