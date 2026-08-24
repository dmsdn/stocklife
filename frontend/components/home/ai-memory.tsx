"use client";

import {
  ArrowRight,
  Sparkles,
} from "lucide-react";

import { SectionTitle } from "./section-title";

type AiMemoryProps = {
  onContinue: () => void;
};

export function AiMemory({
  onContinue,
}: AiMemoryProps) {
  return (
    <section className="w-full px-4 pt-8 sm:px-6 lg:px-8">
      <SectionTitle
        title="AI가 기억하고 있어요"
      />

      <div className="rounded-sm bg-muted/70 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background">
            <Sparkles size={16} />
          </div>

          <div>
            <p className="text-sm font-medium">
              지난번에 5만원 안에서 장보기로 했었어요.
            </p>

            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              이번에도 비슷한 예산으로 장보기를 준비해드릴까요?
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-4 flex w-full items-center justify-center gap-1 rounded-sm bg-background py-2.5 text-sm font-medium"
        >
          지난 계획 이어가기
          <ArrowRight size={12} />
        </button>
      </div>
    </section>
  );
}