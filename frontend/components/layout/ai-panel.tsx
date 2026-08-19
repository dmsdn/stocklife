// 웹 전용 — 우측에서 열리는 AI 패널. 내용은 app/(main)/ai/page.tsx와 동일한 UI를 재사용.
// ⚠ 이후 IA 재논의로 상단 [쇼핑몰|AI챗] 토글이 웹에서도 페이지 전환 방식으로 확정되면서,
//   이 우측 슬라이드 패널 방식과 어떻게 통합할지 재정리가 필요함 (docx 보고서 3장 참고)
"use client";

import { useState } from "react";
import { X, Plus, Mic } from "lucide-react";
import { useAiPanel } from "./ai-panel-context";

const suggestedPrompts = ["이번주에 장보러 가야해", "집에 세제가 없어", "이번주에 장보러 가야해"];

export function AiPanel() {
  const { isOpen, close } = useAiPanel();
  const [message, setMessage] = useState("");

  if (!isOpen) return null;

  return (
    <aside className="hidden w-[420px] shrink-0 flex-col border-l border-border bg-background md:flex">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <span className="text-lg font-semibold">AI이름</span>
        <button type="button" onClick={close} aria-label="AI 패널 닫기">
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-between p-4">
        <div className="space-y-4">
          <p className="text-base">
            안녕하세요 OO님,
            <br />
            어떤 주제로 시작해볼까요?
          </p>
          <div className="space-y-2">
            {suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setMessage(prompt)}
                className="block w-full rounded-full border border-border px-4 py-3 text-left text-sm"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border p-3">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="물어보고 싶은 내용을 질문해보세요"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="첨부"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              <Mic size={14} />
              음성
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
