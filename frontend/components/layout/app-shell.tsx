import { BottomTabBar, DesktopTopNav } from "./bottom-tab-bar";
import { AiPanelProvider } from "./ai-panel-context";
import { AiPanel } from "./ai-panel";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AiPanelProvider>
      <div className="mx-auto flex min-h-full w-full flex-col md:max-w-[1440px]">
        <div className="fixed inset-x-0 top-0 z-[100] hidden border-b border-border bg-background/95 backdrop-blur md:block">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-end gap-3 px-8">
            <DesktopTopNav />
          </div>
        </div>
        <div className="flex flex-1 md:pt-16">
          <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>
          <AiPanel />
        </div>
        <BottomTabBar />
      </div>
    </AiPanelProvider>
  );
}
