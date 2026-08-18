import { BottomTabBar } from "./bottom-tab-bar";
import { AiPanelProvider } from "./ai-panel-context";
import { AiPanel } from "./ai-panel";
import { AiToggleButton } from "./ai-toggle-button";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AiPanelProvider>
      <div className="mx-auto flex min-h-full w-full flex-col md:max-w-[1440px]">
        <div className="hidden justify-end px-8 py-3 md:flex">
          <AiToggleButton />
        </div>
        <div className="flex flex-1">
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          <AiPanel />
        </div>
        <BottomTabBar />
      </div>
    </AiPanelProvider>
  );
}
