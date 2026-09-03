"use client";

import { usePathname } from "next/navigation";
import { BottomTabBar } from "./bottom-tab-bar";
import { AiPanelProvider, useAiPanel } from "./ai-panel-context";
import { BottomBarVisibilityProvider, useBottomBarVisibility } from "./bottom-bar-visibility-context";
import { AiPanel } from "./ai-panel";
import { AiMobileSheet } from "./ai-mobile-sheet";
import { HomeAiHeader } from "./home-ai-header";
import { AiProactiveBubble } from "./ai-proactive-bubble";

// ✅ AiPanel이 이제 position:fixed로 완전히 분리돼서 더 이상 flex 형제로 main 옆에
//   나란히 배치되지 않는다(= main이 자동으로 좁아지지 않는다). 그래서 패널이 열려있을 때
//   본문이 패널 밑에 깔리지 않도록 여기서 md:mr-[420px]을 직접 붙여준다.
//   AiPanelProvider 내부라서 useAiPanel을 쓸 수 있게 별도 컴포넌트로 분리.
function AppShellBody({ children, active }: { children: React.ReactNode; active: "home" | "ai" }) {
  const { isOpen } = useAiPanel();
  // ✅ 하단탭바를 동적으로 숨기는 화면(스캔, 리스트 상세, 매장지도 등)에서 main의 고정
  //   여백(pb-16)까지 같이 없애야 그 밑에 빈 공간이 안 남는다.
  const { hidden: bottomBarHidden } = useBottomBarVisibility();

  return (
    <div className="mx-auto flex min-h-full w-full flex-col md:max-w-[1440px]">
      <div className="fixed inset-x-0 top-0 z-[100] hidden md:block">
        <div className="mx-auto max-w-[1440px] border-b border-border bg-background/95 backdrop-blur">
          <div className="px-8">
            <HomeAiHeader active={active} variant="fixed-desktop" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 md:pt-16">
        <main
          className={`min-w-0 flex-1 transition-[margin] md:pb-0 ${
            bottomBarHidden ? "" : "pb-[calc(4rem+env(safe-area-inset-bottom))]"
          } ${isOpen ? "md:mr-[420px]" : ""}`}
        >
          {children}
        </main>
        <AiPanel />
      </div>

      <BottomTabBar />
      <AiProactiveBubble />
      <AiMobileSheet />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === "/ai" ? "ai" : "home";

  return (
    <AiPanelProvider>
      <BottomBarVisibilityProvider>
        <AppShellBody active={active}>{children}</AppShellBody>
      </BottomBarVisibilityProvider>
    </AiPanelProvider>
  );
}
