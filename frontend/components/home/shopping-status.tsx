"use client";

import { RiAwardLine } from "@remixicon/react";

import { GRADE_TIERS, type GradeTier } from "@/lib/grade";
import { SectionTitle } from "./section-title";

type ShoppingStatusProps = {
  onClick: () => void;
  /** 로그인한 회원의 등급. 백엔드에 "내 정보 조회(GET /me)" API가 아직 없어서
   *  현재 실시간 값(월 누적 결제금액 등)은 못 받아옵니다 — 로그인 여부만으로
   *  등급 체계를 안내하는 카드로 단순화했습니다. */
  currentTier?: GradeTier;
};

// ⚠ 예전엔 "보유 포인트/이번 달 절약/AI 활용 횟수/다음 등급까지 남은 포인트"를 보여줬는데,
//   전부 백엔드에 없는 값(포인트 자체가 없고, 등급 진행률을 조회하는 API도 없음)이라
//   지웠습니다. 대신 실제로 있는 등급 체계(lib/grade.ts, 백엔드 Grade enum 기준)를
//   소개하는 카드로 바꿨습니다. onClick은 마이페이지 전체가 아니라 등급 안내
//   페이지(/mypage/tier-guide)로 바로 연결하는 걸 권장합니다.
export function ShoppingStatus({
  onClick,
  currentTier,
}: ShoppingStatusProps) {
  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <SectionTitle
        title="나의 등급"
        action="더보기"
        onAction={onClick}
      />

      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-sm border border-border bg-background p-4 text-left sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">
              현재 등급
            </p>

            <p className="mt-1 text-base font-semibold">
              {currentTier?.label ?? "로그인하고 등급 확인하기"}
            </p>
          </div>

          <RiAwardLine size={24} className="shrink-0 text-foreground" />
        </div>

        <div className="my-4 h-px bg-border" />

        <div className="flex flex-wrap gap-2">
          {GRADE_TIERS.map((tier) => (
            <span
              key={tier.key}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                currentTier?.key === tier.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground"
              }`}
            >
              {tier.label}
            </span>
          ))}
        </div>
      </button>
    </section>
  );
}
