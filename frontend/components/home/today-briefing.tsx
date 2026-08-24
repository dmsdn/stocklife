"use client";

import { ArrowRight, Lightbulb } from "lucide-react";

import { SectionTitle } from "./section-title";

type TodayBriefingProps = {
  onClick: () => void;
};

export function TodayBriefing({
  onClick,
}: TodayBriefingProps) {
  return (
    <section className="w-full px-4 pt-8 sm:px-6 lg:px-8">
      <SectionTitle
        title="오늘의 쇼핑 브리핑"
      />

      <div className="rounded-sm bg-muted/70 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-background">
            <Lightbulb size={17} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">
              이번 주 생필품을 준비할 시기예요.
            </p>

            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              최근 구매 주기를 분석해보니 휴지와 세제를 다시 구매할 시기가 가까워졌어요.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClick}
          className="mt-4 flex w-full items-center justify-between rounded-sm bg-background px-3 py-3 text-left"
        >
          <div>
            <p className="text-sm text-muted-foreground">
              예상 장보기 금액
            </p>

            <p className="mt-1 text-base font-semibold">
              약 27,800원
            </p>
          </div>

          <span className="flex items-center gap-1 text-sm font-medium">
            장보기 보기
            <ArrowRight size={12} />
          </span>
        </button>
      </div>
    </section>
  );
}