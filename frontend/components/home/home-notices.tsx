// components/home/home-notices.tsx
// ✅ 신규 — "알림" 섹션. 기존 lib/notices.ts(fetchNotices, 실제 GET /api/notices + 목업
//   폴백은 이미 있던 패턴)를 재사용하고, "지난 장보기" 요약은 fetchRecentOrder()의 실제
//   itemCount/totalAmount만 사용합니다.
//   ⚠ 스펙 예시("지난 장보기보다 3,200원 아낄 수 있어요")는 주문 항목별 skuId/구매시점 가격이
//   현재 BackendOrder 타입에 없어서 계산할 수 없습니다 — 임의로 지어내지 않고 생략했습니다.
//   무엇이 더 필요한지는 작업 보고에 정리했습니다.
"use client";

import { useEffect, useState } from "react";
import { RiInformationLine, RiPriceTag3Line } from "@remixicon/react";

import { fetchNotices, type Notice } from "@/lib/notices";
import { fetchDiscoveredProducts, type RecentOrderSummary } from "@/lib/home-data";
import { SectionTitle } from "./section-title";

interface HomeNoticesProps {
  recentOrder: RecentOrderSummary | null;
  onOrdersClick: () => void;
  onDiscountClick: () => void;
}

export function HomeNotices({
  recentOrder,
  onOrdersClick,
  onDiscountClick,
}: HomeNoticesProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [discountCount, setDiscountCount] = useState(0);

  useEffect(() => {
    fetchNotices().then((list) => setNotices(list.slice(0, 2)));
    fetchDiscoveredProducts().then((list) => setDiscountCount(list.length));
  }, []);

  const hasContent = notices.length > 0 || recentOrder !== null || discountCount > 0;
  if (!hasContent) return null;

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <SectionTitle title="알림" />

      <div className="space-y-2">
        {recentOrder && (
          <button
            type="button"
            onClick={onOrdersClick}
            className="flex w-full items-start gap-2.5 rounded-md border border-border p-4 text-left"
          >
            <RiInformationLine size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-sm">
              지난 장보기 · {recentOrder.itemCount}개 상품 · {recentOrder.totalAmount.toLocaleString()}원
            </p>
          </button>
        )}

        {discountCount > 0 && (
          <button
            type="button"
            onClick={onDiscountClick}
            className="flex w-full items-start gap-2.5 rounded-md border border-border p-4 text-left"
          >
            <RiPriceTag3Line size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-sm">지금 할인 중인 상품이 {discountCount}개 있어요</p>
          </button>
        )}

        {notices.map((notice) => (
          <div key={notice.id} className="flex items-start gap-2.5 rounded-md border border-border p-4">
            <RiInformationLine size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{notice.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{notice.date}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
