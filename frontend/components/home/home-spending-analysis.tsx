// components/home/home-spending-analysis.tsx
// ✅ 신규 — 참고 이미지(Frame 123 "이번달 소비 분석")의 누적 막대그래프 카드.
//   /mypage/spending과 같은 실제 API(GET /api/purchases/spending-by-category)를
//   lookbackDays=30("이번달")로 호출 — 가짜 데이터 없이 그대로 재사용.
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { getCategoryColor, buildCategoryPalette } from "@/lib/category-colors";
import { Card } from "@/components/ui/card";

interface CategorySpending {
  categoryL1: string;
  categoryL2: string | null;
  totalQty: number;
  purchaseCount: number;
  totalSpentKrw: number;
}

export function HomeSpendingAnalysis() {
  const [data, setData] = useState<CategorySpending[] | null>(null);

  useEffect(() => {
    apiFetch<CategorySpending[]>("/api/purchases/spending-by-category?lookbackDays=30")
      .then(setData)
      .catch(() => setData([]));
  }, []);

  if (!data || data.length === 0) return null;

  // 대분류 단위로 합산 후 상위 3개 + "그 외"
  const byCategory = new Map<string, number>();
  for (const d of data) {
    byCategory.set(d.categoryL1, (byCategory.get(d.categoryL1) ?? 0) + d.totalSpentKrw);
  }
  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 3);
  const restTotal = sorted.slice(3).reduce((sum, [, v]) => sum + v, 0);
  const total = sorted.reduce((sum, [, v]) => sum + v, 0);
  const topCategoryLabel = sorted[0]?.[0] ?? "";
  // ✅ 수정(2026-09) — 카테고리 이름 해시만으로 색을 뽑으면 두 카테고리가 우연히
  //   가까운 hue를 받아 구분이 안 갈 수 있었음. 이 카드에 실제로 나온 이름들만 넘겨서
  //   서로 최대한 떨어진 색이 나오게(lib/category-colors.ts 참고).
  const palette = buildCategoryPalette(top.map(([label]) => label));

  const segments: { label: string; value: number; color: string }[] = [
    ...top.map(([label, value]) => ({ label, value, color: getCategoryColor(label, 45, palette) })),
    ...(restTotal > 0 ? [{ label: "그 외", value: restTotal, color: "var(--muted)" }] : []),
  ];

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <Card className="p-6">
        <p className="text-xs text-muted-foreground">이번달 소비 분석</p>
        <p className="mt-1 text-lg font-semibold">
          {topCategoryLabel} 상품을 가장 많이 샀어요
        </p>

        <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {segments.map((s) => (
            <span
              key={s.label}
              style={{ width: `${total > 0 ? (s.value / total) * 100 : 0}%`, backgroundColor: s.color }}
            />
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold">{s.value.toLocaleString()}원</span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
