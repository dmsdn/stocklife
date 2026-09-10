// components/domain/spending-cards.tsx
// ✅ 신규 — "소비분석페이지_아이디어.txt"를 참고해서 카드 카탈로그를 정리하고,
//   사용자가 카드를 추가/빼면서 화면을 자유롭게 구성할 수 있게 만든 것. 목업 없이 전부
//   실제 데이터(lib/spending-metrics.ts가 GET /api/orders + GET
//   /api/purchases/spending-by-category로 계산한 값)만 씁니다.
//   txt 파일의 12개 그룹 중 실제 보유 데이터로 바로 만들 수 있는 5개 그룹(금액/카테고리/
//   구매패턴/시간/포인트)만 우선 구현했고, 나머지(재구매주기·할인프로모션·위시리스트연결·
//   소비성향 2차분석·다른사람과비교)는 아직 없습니다 — 페이지 파일 상단 주석 참고.
// ✅ 수정(요청 — 카드 라운드 20, 모든 카드 높이 동일) — 카드마다 defaultSize(half=1칸/
//   full=2칸)를 갖고, CardShell을 카드 타일 모양(rounded-[20px], 고정 높이)으로 바꿨습니다.
//   내용이 고정 높이보다 많은 카드(TOP10, 카테고리 목록 등)는 카드 안에서만 세로 스크롤.
"use client";

import type { SpendingMetrics, CategorySpending } from "@/lib/spending-metrics";
import { weekdayLabel } from "@/lib/spending-metrics";
import { getCategoryColor, buildCategoryPalette } from "@/lib/category-colors";

export type SpendingCardSize = "half" | "full";

export interface SpendingCardDef {
  id: string;
  title: string;
  group: string;
  /** 카드 카탈로그(추가 모달)에 보여줄 한 줄 설명 */
  description: string;
  /** 카탈로그에서 "+"로 추가할 때 기본으로 들어가는 크기. 추가된 뒤엔 편집모드에서
   *  언제든 바꿀 수 있음(실제 값은 페이지의 layout 상태가 가짐). */
  defaultSize: SpendingCardSize;
  render: (m: SpendingMetrics, categoryData: CategorySpending[]) => React.ReactNode;
}

// ✅ 카드 타일 — 둥근 모서리 20px, 옅은 배경, 모든 카드 높이 동일(h-48). 내용이 넘치면
//   카드 안에서만 스크롤(overflow-y-auto)해서 그리드 전체 높이는 항상 일정하게 유지.
// ✅ 수정(요청 — "카드 보더도 없고 텍스트 덩어리 같다, 홈화면처럼 넣어") — 홈 화면 카드와
//   똑같은 스타일(rounded-[20px] border border-card-border bg-white)로 맞춤.
function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex h-48 flex-col rounded-[20px] border border-card-border bg-white p-4">
      <p className="shrink-0 text-sm font-semibold">{title}</p>
      <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function Bar({ segments }: { segments: { color: string; percent: number }[] }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {segments.map((s, i) => (
        <span key={i} style={{ width: `${s.percent}%`, backgroundColor: s.color }} />
      ))}
    </div>
  );
}

function Change({ current, prev }: { current: number; prev: number }) {
  if (prev === 0) return <span className="text-muted-foreground">비교할 지난 기간 데이터가 없어요</span>;
  const diff = current - prev;
  const percent = Math.round((diff / prev) * 100);
  const up = diff > 0;
  const flat = diff === 0;
  return (
    <span className={flat ? "text-muted-foreground" : up ? "text-danger" : "text-brand"}>
      {flat ? "지난 기간과 동일" : `${up ? "▲" : "▼"} ${Math.abs(diff).toLocaleString()}원 (${Math.abs(percent)}%)`}
    </span>
  );
}

export const SPENDING_CARDS: SpendingCardDef[] = [
  // ── 1. 소비 금액 분석 ─────────────────────────────────────
  {
    id: "total_spent",
    title: "이번 기간 총 소비",
    group: "소비 금액",
    description: "선택한 기간 동안 사용한 총 금액",
    defaultSize: "half",
    render: (m) => (
      <CardShell title="이번 기간 총 소비">
        <p className="text-2xl font-bold">{m.totalSpent.toLocaleString()}원</p>
      </CardShell>
    ),
  },
  {
    id: "prev_compare",
    title: "지난 기간 대비 소비",
    group: "소비 금액",
    description: "직전 동일 길이 기간과 비교해 얼마나 늘거나 줄었는지",
    defaultSize: "half",
    render: (m) => (
      <CardShell title="지난 기간 대비 소비">
        <p className="text-lg font-semibold">{m.totalSpent.toLocaleString()}원</p>
        <p className="mt-1 text-sm">
          <Change current={m.totalSpent} prev={m.prevTotalSpent} />
        </p>
      </CardShell>
    ),
  },
  {
    id: "avg_per_day",
    title: "일평균 소비",
    group: "소비 금액",
    description: "하루 평균 사용 금액",
    defaultSize: "half",
    render: (m) => (
      <CardShell title="일평균 소비">
        <p className="text-2xl font-bold">{m.avgPerDay.toLocaleString()}원</p>
      </CardShell>
    ),
  },
  {
    id: "avg_per_order",
    title: "구매 1회 평균 금액",
    group: "소비 금액",
    description: "한 번 구매할 때 평균 지출",
    defaultSize: "half",
    render: (m) => (
      <CardShell title="구매 1회 평균 금액">
        <p className="text-2xl font-bold">{m.avgPerOrder.toLocaleString()}원</p>
      </CardShell>
    ),
  },
  {
    id: "avg_price_per_item",
    title: "상품 1개 평균 가격",
    group: "소비 금액",
    description: "구매한 상품 하나당 평균 가격",
    defaultSize: "half",
    render: (m) => (
      <CardShell title="상품 1개 평균 가격">
        <p className="text-2xl font-bold">{m.avgPricePerItem.toLocaleString()}원</p>
      </CardShell>
    ),
  },
  {
    id: "total_orders",
    title: "총 구매 횟수",
    group: "소비 금액",
    description: "선택한 기간 동안 구매한 횟수",
    defaultSize: "half",
    render: (m) => (
      <CardShell title="총 구매 횟수">
        <p className="text-2xl font-bold">{m.totalOrders}번</p>
      </CardShell>
    ),
  },
  {
    id: "total_qty",
    title: "총 구매 수량",
    group: "소비 금액",
    description: "구매한 상품의 총 수량",
    defaultSize: "half",
    render: (m) => (
      <CardShell title="총 구매 수량">
        <p className="text-2xl font-bold">{m.totalQty}개</p>
      </CardShell>
    ),
  },
  {
    id: "daily_trend",
    title: "소비 금액 추이",
    group: "소비 금액",
    description: "날짜별 소비 금액 변화",
    defaultSize: "full",
    render: (m) => {
      const max = Math.max(1, ...m.dailySeries.map((d) => d.amount));
      return (
        <CardShell title="소비 금액 추이">
          {m.dailySeries.length === 0 ? (
            <p className="text-sm text-muted-foreground">표시할 데이터가 없어요.</p>
          ) : (
            <div className="flex h-24 items-end gap-1 overflow-x-auto">
              {m.dailySeries.map((d) => (
                <div key={d.isoDate} className="flex min-w-[10px] flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-sm bg-brand"
                    style={{ height: `${Math.max(4, (d.amount / max) * 80)}px` }}
                    title={`${d.dateLabel} · ${d.amount.toLocaleString()}원`}
                  />
                  <span className="text-[9px] text-muted-foreground">{d.dateLabel}</span>
                </div>
              ))}
            </div>
          )}
        </CardShell>
      );
    },
  },
  {
    id: "max_min_day",
    title: "소비 최다·최소일",
    group: "소비 금액",
    description: "가장 많이/적게 소비한 날짜",
    defaultSize: "half",
    render: (m) => (
      <CardShell title="소비 최다·최소일">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">많았던 날</span>
          <span className="text-xs font-semibold">
            {m.maxSpendDay ? `${m.maxSpendDay.dateLabel} · ${m.maxSpendDay.amount.toLocaleString()}원` : "-"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">적었던 날</span>
          <span className="text-xs font-semibold">
            {m.minSpendDay ? `${m.minSpendDay.dateLabel} · ${m.minSpendDay.amount.toLocaleString()}원` : "-"}
          </span>
        </div>
      </CardShell>
    ),
  },
  {
    id: "avg_interval",
    title: "평균 소비 간격",
    group: "소비 금액",
    description: "구매와 구매 사이 평균 간격",
    defaultSize: "half",
    render: (m) => (
      <CardShell title="평균 소비 간격">
        <p className="text-2xl font-bold">
          {m.avgIntervalDays != null ? `${m.avgIntervalDays}일` : "-"}
        </p>
        {m.avgIntervalDays == null && <p className="mt-1 text-xs text-muted-foreground">구매 2건 이상일 때 표시돼요</p>}
      </CardShell>
    ),
  },

  // ── 2. 카테고리 분석 ─────────────────────────────────────
  {
    id: "category_spending",
    title: "카테고리별 소비 · 비중",
    group: "카테고리",
    description: "어떤 대분류에 얼마나, 몇 %를 썼는지",
    defaultSize: "full",
    render: (_m, categoryData) => {
      const byCategory = new Map<string, number>();
      for (const d of categoryData) byCategory.set(d.categoryL1, (byCategory.get(d.categoryL1) ?? 0) + d.totalSpentKrw);
      const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
      const total = sorted.reduce((s, [, v]) => s + v, 0);
      const palette = buildCategoryPalette(sorted.map(([name]) => name));
      return (
        <CardShell title="카테고리별 소비 · 비중">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">표시할 데이터가 없어요.</p>
          ) : (
            <>
              <Bar segments={sorted.map(([name, v]) => ({ color: getCategoryColor(name, 45, palette), percent: total > 0 ? (v / total) * 100 : 0 }))} />
              <div className="mt-4 space-y-2.5">
                {sorted.map(([name, v]) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(name, 45, palette) }} />
                    <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                    <span className="shrink-0 text-sm font-medium">{v.toLocaleString()}원</span>
                    <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">
                      {total > 0 ? Math.round((v / total) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardShell>
      );
    },
  },
  {
    id: "category_count_qty",
    title: "카테고리별 구매횟수 · 수량",
    group: "카테고리",
    description: "카테고리별로 몇 번, 몇 개를 구매했는지",
    defaultSize: "full",
    render: (_m, categoryData) => {
      const byCategory = new Map<string, { count: number; qty: number }>();
      for (const d of categoryData) {
        const cur = byCategory.get(d.categoryL1) ?? { count: 0, qty: 0 };
        cur.count += d.purchaseCount;
        cur.qty += d.totalQty;
        byCategory.set(d.categoryL1, cur);
      }
      const sorted = [...byCategory.entries()].sort((a, b) => b[1].qty - a[1].qty);
      return (
        <CardShell title="카테고리별 구매횟수 · 수량">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">표시할 데이터가 없어요.</p>
          ) : (
            <div className="space-y-2.5">
              {sorted.map(([name, v]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="min-w-0 truncate">{name}</span>
                  <span className="shrink-0 text-muted-foreground">{v.count}건 · {v.qty}개</span>
                </div>
              ))}
            </div>
          )}
        </CardShell>
      );
    },
  },

  // ── 3. 구매 패턴 분석 ─────────────────────────────────────
  {
    id: "top_products",
    title: "나의 구매 TOP 10",
    group: "구매 패턴",
    description: "가장 많이 구매한 상품 순위(소비액 기준)",
    defaultSize: "full",
    render: (m) => (
      <CardShell title="나의 구매 TOP 10">
        {m.productAgg.length === 0 ? (
          <p className="text-sm text-muted-foreground">표시할 데이터가 없어요.</p>
        ) : (
          <ol className="space-y-2.5">
            {m.productAgg.slice(0, 10).map((p, i) => (
              <li key={p.skuId} className="flex items-center gap-2 text-sm">
                <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-muted-foreground">{p.qty}개</span>
                <span className="shrink-0 font-medium">{p.spent.toLocaleString()}원</span>
              </li>
            ))}
          </ol>
        )}
      </CardShell>
    ),
  },
  {
    id: "frequent_products",
    title: "자주 구매하는 상품",
    group: "구매 패턴",
    description: "구매 횟수가 가장 많은 상품",
    defaultSize: "half",
    render: (m) => {
      const byCount = [...m.productAgg].sort((a, b) => b.purchaseCount - a.purchaseCount).slice(0, 5);
      return (
        <CardShell title="자주 구매하는 상품">
          {byCount.length === 0 ? (
            <p className="text-sm text-muted-foreground">표시할 데이터가 없어요.</p>
          ) : (
            <div className="space-y-2">
              {byCount.map((p) => (
                <div key={p.skuId} className="flex items-center justify-between text-xs">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="shrink-0 text-muted-foreground">{p.purchaseCount}번</span>
                </div>
              ))}
            </div>
          )}
        </CardShell>
      );
    },
  },

  // ── 4. 시간 분석 ─────────────────────────────────────
  {
    id: "weekday_spending",
    title: "요일별 소비",
    group: "시간",
    description: "어떤 요일에 가장 많이 소비하는지",
    defaultSize: "full",
    render: (m) => {
      const max = Math.max(1, ...m.weekdaySpent);
      const busiest = m.weekdaySpent.indexOf(max);
      return (
        <CardShell title="요일별 소비">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{weekdayLabel(busiest)}요일</span>에 가장 많이 소비했어요
          </p>
          <div className="mt-3 flex h-20 items-end gap-2">
            {m.weekdaySpent.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t-sm bg-brand" style={{ height: `${Math.max(4, (v / max) * 64)}px` }} />
                <span className="text-[10px] text-muted-foreground">{weekdayLabel(i)}</span>
              </div>
            ))}
          </div>
        </CardShell>
      );
    },
  },
  {
    id: "weekend_vs_weekday",
    title: "평일 vs 주말",
    group: "시간",
    description: "평일과 주말의 소비 비교",
    defaultSize: "half",
    render: (m) => {
      const total = m.weekendSpent + m.weekdaySpentTotal;
      return (
        <CardShell title="평일 vs 주말">
          <Bar
            segments={[
              { color: "hsl(20, 70%, 55%)", percent: total > 0 ? (m.weekdaySpentTotal / total) * 100 : 0 },
              { color: "hsl(210, 70%, 55%)", percent: total > 0 ? (m.weekendSpent / total) * 100 : 0 },
            ]}
          />
          <div className="mt-2 flex justify-between text-xs">
            <span>평일 {m.weekdaySpentTotal.toLocaleString()}원</span>
            <span>주말 {m.weekendSpent.toLocaleString()}원</span>
          </div>
        </CardShell>
      );
    },
  },
  {
    id: "hourly_spending",
    title: "시간대별 소비",
    group: "시간",
    description: "하루 중 어느 시간대에 소비가 많은지",
    defaultSize: "full",
    render: (m) => {
      const max = Math.max(1, ...m.hourSpent);
      return (
        <CardShell title="시간대별 소비">
          <div className="flex h-16 items-end gap-[2px]">
            {m.hourSpent.map((v, h) => (
              <div key={h} className="flex-1 rounded-t-sm bg-brand" style={{ height: `${Math.max(2, (v / max) * 60)}px` }} title={`${h}시 · ${v.toLocaleString()}원`} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>0시</span>
            <span>12시</span>
            <span>23시</span>
          </div>
        </CardShell>
      );
    },
  },

  // ── 5. 포인트 분석 ─────────────────────────────────────
  {
    id: "points_earned_used",
    title: "이번 기간 적립 · 사용 포인트",
    group: "포인트",
    description: "선택한 기간 동안 적립/사용한 포인트",
    defaultSize: "half",
    render: (m) => (
      <CardShell title="적립 · 사용 포인트">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">적립</span>
          <span className="font-semibold text-brand">+{m.pointsEarned.toLocaleString()}P</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">사용</span>
          <span className="font-semibold">-{m.pointsUsed.toLocaleString()}P</span>
        </div>
      </CardShell>
    ),
  },
  {
    id: "points_balance_rate",
    title: "포인트 활용률",
    group: "포인트",
    description: "적립한 포인트 중 실제로 얼마나 사용했는지",
    defaultSize: "half",
    render: (m) => {
      const rate = m.pointsEarned > 0 ? Math.round((m.pointsUsed / m.pointsEarned) * 100) : 0;
      return (
        <CardShell title="포인트 활용률">
          <p className="text-2xl font-bold">{rate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.pointsEarned.toLocaleString()}P 중 {m.pointsUsed.toLocaleString()}P 사용
          </p>
        </CardShell>
      );
    },
  },
];

/** ✅ 카드 id -> 카탈로그 정의. */
export const SPENDING_CARDS_BY_ID = new Map(SPENDING_CARDS.map((c) => [c.id, c]));

export interface SpendingLayoutItem {
  id: string;
  size: SpendingCardSize;
}

export const DEFAULT_LAYOUT: SpendingLayoutItem[] = [
  { id: "total_spent", size: "half" },
  { id: "prev_compare", size: "half" },
  { id: "category_spending", size: "full" },
  { id: "daily_trend", size: "full" },
  { id: "top_products", size: "full" },
  { id: "weekday_spending", size: "full" },
  { id: "points_earned_used", size: "half" },
];
