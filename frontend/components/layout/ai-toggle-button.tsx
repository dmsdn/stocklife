"use client";

import { useAiPanel } from "./ai-panel-context";
import { cn } from "@/lib/utils";

export function AiToggleButton() {
  const { isOpen, toggle } = useAiPanel();
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-medium",
        isOpen ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground"
      )}
    >
      AI이름
    </button>
  );
}
