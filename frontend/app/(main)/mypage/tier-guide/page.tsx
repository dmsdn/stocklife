// app/(main)/mypage/tier-guide/page.tsx
// ✅ 실제 GET /api/consumers/me 연동으로 교체. 예전엔 monthlySpendAmount(이번 달 결제금액)를
//   쓰는 존재하지 않는 API(/api/consumers/grade)를 불렀는데, 이제 등급이 "평생 누적 적립
//   포인트" 기준으로 바뀌면서 /api/consumers/me가 이미 pointBalance/pointEarnedTotal/grade를
//   다 내려줘서 별도 엔드포인트가 필요 없어졌습니다.
"use client";

import { useEffect, useState } from "react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { GRADE_TIERS, calculateGrade, gradeIconSrc } from "@/lib/grade";
import { getMyProfile } from "@/lib/consumer-api";

export default function TierGuidePage() {
  const [pointBalance, setPointBalance] = useState(0);
  const [pointEarnedTotal, setPointEarnedTotal] = useState(0);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setPointBalance(p.pointBalance);
        setPointEarnedTotal(p.pointEarnedTotal);
      })
      .catch(() => {});
  }, []);

  const currentTier = calculateGrade(pointEarnedTotal);
  const currentIndex = GRADE_TIERS.findIndex((t) => t.key === currentTier.key);
  const nextTier = GRADE_TIERS[currentIndex + 1];

  const progressPercent = nextTier
    ? Math.min(100, ((pointEarnedTotal - currentTier.threshold) / (nextTier.threshold - currentTier.threshold)) * 100)
    : 100;

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="등급 안내" />

      {/* 현재 등급 카드 */}
      <div className="rounded-sm border border-border p-5">
        <p className="text-xs text-muted-foreground">현재 등급</p>
        <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gradeIconSrc(currentTier.key)} alt="" className="h-6 w-6" />
          {currentTier.label}
        </p>

        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span>달성 포인트 {pointEarnedTotal.toLocaleString()}P</span>
          <span>사용 가능 {pointBalance.toLocaleString()}P</span>
        </div>

        {nextTier && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs">
              <span>{currentTier.label}</span>
              <span className="text-muted-foreground">다음 등급 &gt; {nextTier.label}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {nextTier.label}까지 {(nextTier.threshold - pointEarnedTotal).toLocaleString()}P 남았어요
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
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gradeIconSrc(tier.key)} alt="" className="h-5 w-5" />
                  {tier.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tier.threshold === 0 ? "기본" : `누적 ${tier.threshold.toLocaleString()}P 이상`}
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
