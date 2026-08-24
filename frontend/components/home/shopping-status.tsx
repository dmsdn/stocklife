"use client";

import { Star } from "lucide-react";

import { SectionTitle } from "./section-title";

type ShoppingStatusProps = {
  onClick: () => void;
};

export function ShoppingStatus({
  onClick,
}: ShoppingStatusProps) {
  return (
    <section className="w-full px-4 pt-7 sm:px-6 lg:px-8">
      <SectionTitle
        eyebrow="MY SHOPPING"
        title="나의 쇼핑 상태"
        action="자세히 보기"
      />

      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-sm border border-border bg-background p-4 text-left sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">
              안녕하세요, OO님
            </p>

            <p className="mt-1 text-base font-semibold">
              SHOPPER
            </p>
          </div>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Star size={18} />
          </div>
        </div>

        <div className="my-4 h-px bg-border" />

        <div className="grid grid-cols-3">
          <StatusItem
            label="보유 포인트"
            value="2,840P"
          />

          <StatusItem
            label="이번 달 절약"
            value="18,400원"
            border
          />

          <StatusItem
            label="AI 활용"
            value="12회"
            border
          />
        </div>

        <div className="mt-4 rounded-sm bg-muted/60 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              다음 등급까지
            </span>

            <span className="text-base font-medium">
              160P
            </span>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-border">
            <div className="h-full w-[78%] rounded-sm bg-foreground" />
          </div>
        </div>
      </button>
    </section>
  );
}

function StatusItem({
  label,
  value,
  border = false,
}: {
  label: string;
  value: string;
  border?: boolean;
}) {
  return (
    <div
      className={`px-2 ${
        border ? "border-l border-border" : ""
      }`}
    >
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-base font-semibold">
        {value}
      </p>
    </div>
  );
}