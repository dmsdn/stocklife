"use client";

import { BottomTabBar } from "./bottom-tab-bar";
import { AiPanelProvider, useAiPanel } from "./ai-panel-context";
import { BottomBarVisibilityProvider, useBottomBarVisibility } from "./bottom-bar-visibility-context";
import { AiPanel } from "./ai-panel";
import { AiMobileSheet } from "./ai-mobile-sheet";
import { HomeAiHeader } from "./home-ai-header";
import { useProactiveStream } from "@/lib/realtime";
import { saveProactiveNotification } from "@/lib/proactive-notifications";

// ✅ AiPanel이 이제 position:fixed로 완전히 분리돼서 더 이상 flex 형제로 main 옆에
//   나란히 배치되지 않는다(= main이 자동으로 좁아지지 않는다). 그래서 패널이 열려있을 때
//   본문이 패널 밑에 깔리지 않도록 여기서 md:mr-[420px]을 직접 붙여준다.
//   AiPanelProvider 내부라서 useAiPanel을 쓸 수 있게 별도 컴포넌트로 분리.
// ✅ 수정(2026-09) — "리브 페이지"(구 /ai 라우트) 완전 삭제로 pathname 기준 active 판정이
//   더 이상 의미가 없어짐(그 라우트 자체가 없음). 데스크톱 상단 헤더는 항상 "home" 모습.
function AppShellBody({ children }: { children: React.ReactNode }) {
  const { isOpen } = useAiPanel();
  // 수신·복구 알림은 보관함과 배지가 같은 읽음 상태를 사용한다.
  useProactiveStream((m) => {
    saveProactiveNotification(m);
  });
  // ✅ 하단탭바를 동적으로 숨기는 화면(스캔, 리스트 상세, 매장지도 등)에서 main의 고정
  //   여백(pb-16)까지 같이 없애야 그 밑에 빈 공간이 안 남는다.
  // ✅ noReserve — 탭바는 계속 보이지만(hidden 아님), Footer가 스스로 그 여백을
  //   자기 배경색으로 확보하는 페이지(홈, 마이페이지)에서 main이 중복으로 또 예약하지
  //   않게 함(이중 여백/색 다른 여백 방지).
  const { hidden: bottomBarHidden, noReserve } = useBottomBarVisibility();

  return (
    <div className="mx-auto flex min-h-full w-full flex-col md:max-w-[1440px]">
      <div className="fixed inset-x-0 top-0 z-[100] hidden md:block">
        <div className="mx-auto max-w-[1440px] border-b border-border bg-background/95 backdrop-blur">
          <div className="px-8">
            <HomeAiHeader active="home" variant="fixed-desktop" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 md:pt-16">
        <main
          className={`min-w-0 flex-1 transition-[margin] md:pb-0 ${
            bottomBarHidden || noReserve ? "" : "pb-[calc(4rem+env(safe-area-inset-bottom))]"
          } ${isOpen ? "md:mr-[420px]" : ""}`}
        >
          {children}
        </main>
        <AiPanel />
      </div>

      <BottomTabBar />
      <AiMobileSheet />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AiPanelProvider>
      <BottomBarVisibilityProvider>
        <AppShellBody>{children}</AppShellBody>
      </BottomBarVisibilityProvider>
    </AiPanelProvider>
  );
}
