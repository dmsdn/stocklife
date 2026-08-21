"use client";

import { usePathname } from "next/navigation";
import { BottomTabBar } from "./bottom-tab-bar";
import { AiPanelProvider } from "./ai-panel-context";
import { AiPanel } from "./ai-panel";
import { HomeAiHeader } from "./home-ai-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === "/ai" ? "ai" : "home";

  return (
    <AiPanelProvider>
      <div className="mx-auto flex min-h-full w-full flex-col md:max-w-[1440px]">
        <div className="fixed inset-x-0 top-0 z-[100] hidden md:block">
          <div className="mx-auto max-w-[1440px] border-b border-border bg-background/95 backdrop-blur">
            <div className="px-8">
              <HomeAiHeader active={active} variant="fixed-desktop" />
            </div>
          </div>
        </div>

        <div className="flex flex-1 md:pt-16">
          <main className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
          <AiPanel />
        </div>

        <BottomTabBar />
      </div>
    </AiPanelProvider>
  );
}
