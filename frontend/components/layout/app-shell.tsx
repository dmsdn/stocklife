"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { BottomTabBar } from "./bottom-tab-bar";
import { AiPanelProvider, useAiPanel } from "./ai-panel-context";
import { AiPanel } from "./ai-panel";
import { HomeAiHeader } from "./home-ai-header";
import { notifySimulationOfCurrentAuthOnce } from "@/lib/simulation-bridge";

// ✅ AiPanel이 이제 position:fixed로 완전히 분리돼서 더 이상 flex 형제로 main 옆에
//   나란히 배치되지 않는다(= main이 자동으로 좁아지지 않는다). 그래서 패널이 열려있을 때
//   본문이 패널 밑에 깔리지 않도록 여기서 md:mr-[420px]을 직접 붙여준다.
//   AiPanelProvider 내부라서 useAiPanel을 쓸 수 있게 별도 컴포넌트로 분리.
function AppShellBody({ children, active }: { children: React.ReactNode; active: "home" | "ai" }) {
    const { isOpen } = useAiPanel();

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
                    className={`min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] transition-[margin] md:pb-0 ${
                        isOpen ? "md:mr-[420px]" : ""
                    }`}
                >
                    {children}
                </main>
                <AiPanel />
            </div>

            <BottomTabBar />
        </div>
    );
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const active = pathname === "/ai" ? "ai" : "home";

    // frontend가 Simulation iframe 옆에 붙어 열릴 때마다(=새로고침 포함) 지금 로그인 상태를
    // 한 번 더 알려준다. 로그인/로그아웃 그 순간에만 알리면, iframe이 나중에 새로 열렸을 때
    // (이미 로그인된 상태로) Simulation이 그 사실을 모르는 문제가 생긴다.
    useEffect(() => {
        notifySimulationOfCurrentAuthOnce();
    }, []);

    return (
        <AiPanelProvider>
            <AppShellBody active={active}>{children}</AppShellBody>
        </AiPanelProvider>
    );
}