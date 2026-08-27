// app/(main)/mypage/tier-guide/page.tsx
// ⚠ 이번 달 누적 결제금액(monthlySpend)은 이 화면 전용 조회 API가 없어서 목업입니다.
//   실제로는 서버가 매달 계산하는 값이라, 생기면 이 값만 API로 교체하면 됩니다.
"use client";

import { useEffect, useState } from "react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { GRADE_TIERS, calculateGrade } from "@/lib/grade";
import { fetchMyGrade } from "@/lib/consumer-benefits";

export default function TierGuidePage() {
  // ✅ 실제 GET /api/consumers/grade 연동. 실패하면(API 아직 없음) 0원 기준(BASIC)으로 표시.
  const [monthlySpend, setMonthlySpend] = useState(0);

  useEffect(() => {
    fetchMyGrade().then((g) => {
      if (g) setMonthlySpend(g.monthlySpendAmount);
    });
  }, []);
  const currentTier = calculateGrade(monthlySpend);
  const currentIndex = GRADE_TIERS.findIndex((t) => t.key === currentTier.key);
  const nextTier = GRADE_TIERS[currentIndex + 1];

  const progressPercent = nextTier
    ? Math.min(100, ((monthlySpend - currentTier.threshold) / (nextTier.threshold - currentTier.threshold)) * 100)
    : 100;

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="등급 안내" />

      {/* 현재 등급 카드 */}
      <div className="rounded-sm border border-border bg-muted p-5">
        <p className="text-xs text-muted-foreground">현재 등급</p>
        <p className="mt-1 text-2xl font-bold">{currentTier.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">이번 달 누적 결제 {monthlySpend.toLocaleString()}원</p>

        {nextTier && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {nextTier.label}까지 {(nextTier.threshold - monthlySpend).toLocaleString()}원 남았어요
            </p>
          </div>
        )}
      </div>

      {/* 등급별 혜택 */}
      <div className="mt-6 space-y-3">
        {GRADE_TIERS.map((tier) => {
          const isCurrent = tier.key === currentTier.key;
          return (
            <div
              key={tier.key}
              className={`rounded-sm border p-4 ${isCurrent ? "border-primary" : "border-border"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{tier.label}</p>
                <p className="text-xs text-muted-foreground">
                  {tier.threshold === 0 ? "기본" : `월 ${tier.threshold.toLocaleString()}원 이상`}
                </p>
              </div>
              <ul className="mt-2 space-y-1">
                {tier.benefits.map((b) => (
                  <li key={b} className="text-xs text-muted-foreground">· {b}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
