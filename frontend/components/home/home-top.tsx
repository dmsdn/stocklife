// components/home/home-top.tsx
// ✅ 홈 리디자인(2026-08, 4차 — 구조 전면 재작업)
//   기존엔 프로필/등급/최근결제를 구분선으로 나눈 "3단 스택" 카드였는데, 이것도 결국
//   예전 레이아웃(위→아래로 쌓인 행)과 실루엣이 똑같아서 "안 바뀐 것 같다"는 피드백을
//   받았습니다. 이번엔 실제로 다른 그리드 구조로 다시 짰습니다:
//   - 상단: 아바타+인사말 한 줄 + 오른쪽 위에 등급 뱃지(pill)를 얹는 방식 (기존엔 등급이
//     별도의 전체 행이었음)
//   - 하단: grid-cols-2로 "등급 진행률"과 "최근 결제"를 나란히 두 칸에 배치(기존엔 세로로
//     쌓인 두 개의 전체 너비 행이었음) — 가운데 세로 구분선(border-l)으로만 나눔
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiBillLine } from "@remixicon/react";
import { GRADE_TIERS } from "@/lib/grade";
import { getMyProfile, type ConsumerMe } from "@/lib/consumer-api";
import type { RecentOrderSummary } from "@/lib/home-data";

const ORDER_STATUS_LABEL: Record<string, string> = {
  PAID: "결제완료",
  REFUND_REQUESTED: "환불요청",
  REFUNDED: "환불완료",
};

interface HomeTopProps {
  recentOrder: RecentOrderSummary | null;
  onOrdersClick: () => void;
}

export function HomeTop({ recentOrder, onOrdersClick }: HomeTopProps) {
  const [profile, setProfile] = useState<ConsumerMe | null>(null);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  if (!profile) return null;

  const currentTierIndex = GRADE_TIERS.findIndex((t) => t.key === profile.grade);
  const currentTier = GRADE_TIERS[Math.max(currentTierIndex, 0)];
  const nextTier = GRADE_TIERS[currentTierIndex + 1];

  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.max(
          0,
          ((profile.monthlySpendAmount - currentTier.threshold) /
            (nextTier.threshold - currentTier.threshold)) *
            100
        )
      )
    : 100;

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-border bg-background p-4">
        {/* 상단 — 아바타 + 인사말 + 등급 뱃지(같은 행) */}
        <Link href="/mypage/account" className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-base font-semibold text-background">
            {profile.name?.[0] ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{profile.name ?? "이름 미입력"}님, 안녕하세요</p>
            <p className="text-xs text-muted-foreground">오늘도 필요한 걸 빠르게 챙겨보세요</p>
          </div>
          <span className="shrink-0 rounded-full border border-foreground px-2.5 py-1 text-md font-semibold">
            {currentTier.label}
          </span>
        </Link>

        <div className="my-4 h-px bg-border" />

        {/* 하단 — 2열 그리드: 등급 진행률 / 최근 결제 */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/mypage/tier-guide" className="min-w-0">
            <p className="text-xs text-muted-foreground">다음 등급까지</p>
            {nextTier ? (
              <>
                <p className="mt-1 truncate text-sm font-semibold">{nextTier.label}까지 조금 더</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm font-semibold">최고 등급이에요</p>
            )}
          </Link>

          <button
            type="button"
            onClick={onOrdersClick}
            className="flex min-w-0 items-start justify-between gap-2 border-l border-border pl-4 text-left"
          >
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">최근 결제</p>
              <p className="mt-1 truncate text-sm font-semibold">
                {recentOrder
                  ? `${ORDER_STATUS_LABEL[recentOrder.status] ?? recentOrder.status}`
                  : "내역 없음"}
              </p>
              {recentOrder && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {recentOrder.totalAmount.toLocaleString()}원
                </p>
              )}
            </div>
            <RiBillLine size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
          </button>
        </div>
      </div>
    </section>
  );
}
