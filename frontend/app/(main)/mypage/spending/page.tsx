// app/(main)/mypage/spending/page.tsx
// ✅ 신규 — 백엔드에 방금 생긴 GET /api/purchases/spending-by-category 연동. 대분류 단위로
//   지출 금액을 집계해서 내려주는, 소비 분석 전용으로 만든 엔드포인트입니다.
//   색상은 지난 논의대로 대분류마다 고유 hue를 자동 배정(lib/category-colors.ts).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiArrowLeftSLine } from "@remixicon/react";
import { apiFetch } from "@/lib/api-client";
import { getCategoryColor } from "@/lib/category-colors";

interface CategorySpending {
  categoryL1: string;
  categoryL2: string | null;
  totalQty: number;
  purchaseCount: number;
  totalSpentKrw: number;
}

const LOOKBACK_OPTIONS = [
  { label: "최근 30일", days: 30 },
  { label: "최근 90일", days: 90 },
  { label: "최근 1년", days: 365 },
];

export default function SpendingAnalysisPage() {
  const [lookbackDays, setLookbackDays] = useState(90);
  const [data, setData] = useState<CategorySpending[] | null>(null);

  useEffect(() => {
    setData(null);
    apiFetch<CategorySpending[]>(`/api/purchases/spending-by-category?lookbackDays=${lookbackDays}`)
      .then(setData)
      .catch(() => setData([]));
  }, [lookbackDays]);

  const total = data?.reduce((sum, d) => sum + d.totalSpentKrw, 0) ?? 0;

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border bg-background px-4">
        <Link href="/mypage" className="flex h-10 w-10 items-center justify-center rounded-full" aria-label="뒤로가기">
          <RiArrowLeftSLine size={20} />
        </Link>
        <h1 className="flex-1 text-center text-base font-semibold">소비 분석</h1>
        <div className="w-10" />
      </header>

      <section className="px-4 pt-4">
        <div className="flex gap-2">
          {LOOKBACK_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setLookbackDays(opt.days)}
              className={
                opt.days === lookbackDays
                  ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  : "rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {data === null ? (
          <p className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</p>
        ) : data.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">이 기간엔 구매 내역이 없어요.</p>
        ) : (
          <>
            <p className="mt-6 text-sm text-muted-foreground">
              총 지출 <span className="font-semibold text-foreground">{total.toLocaleString()}원</span>
            </p>

            {/* 카테고리별 지출 비율 막대 (누적 가로 막대 하나로 전체 비중 한눈에) */}
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full">
              {data.map((d) => (
                <div
                  key={d.categoryL1}
                  style={{
                    width: `${(d.totalSpentKrw / total) * 100}%`,
                    backgroundColor: getCategoryColor(d.categoryL1),
                  }}
                />
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {data.map((d) => {
                const percent = total > 0 ? Math.round((d.totalSpentKrw / total) * 100) : 0;
                return (
                  <div key={d.categoryL1} className="flex items-center gap-3 rounded-sm border border-border p-3">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: getCategoryColor(d.categoryL1) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.categoryL1}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.purchaseCount}건 · {d.totalQty}개
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{d.totalSpentKrw.toLocaleString()}원</p>
                      <p className="text-xs text-muted-foreground">{percent}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
