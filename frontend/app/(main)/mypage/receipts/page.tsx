// app/(main)/mypage/receipts/page.tsx
// ✅ 구매내역과 별개 화면이 아니라 이게 유일한 목록입니다(실제 주문 데이터 GET /api/orders).
//   누르면 전자 영수증을 모달로 바로 띄워서 보여줍니다(페이지 이동 없음).
// ✅ 수정(2026-09, 2차) — 요청: 상단에 연/월 드롭다운 필터 + 목록에 구매 날짜 표시 +
//   구매내역/교환·반품·환불/소비분석 화면과 같은 "쭉쭉 나열" 리스트 스타일로 통일.
//   실제 주문이 아직 없어서 디자인 확인이 안 된다는 요청으로, 목록이 비어있을 때는
//   더미 영수증 몇 건을 함께 보여줍니다(실제 주문이 있으면 그게 우선 — 더미는 화면이
//   완전히 빌 때만 채워 넣는 용도).
"use client";

import { useEffect, useMemo, useState } from "react";
import { RiBillLine, RiArrowDownSLine } from "@remixicon/react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { ReceiptDialog } from "@/components/domain/receipt-dialog";
import { apiFetch } from "@/lib/api-client";

interface Order {
  orderId: number;
  totalAmount: number;
  status: string;
  items: { skuId: number; productName: string; priceKrw: number; quantity: number }[];
  orderedAt?: string;
  paymentMethod?: string;
  pointsUsed?: number;
  pointsEarned?: number;
}

const ALL_MONTHS = "전체";

// ✅ 실제 주문이 0건일 때만 보여주는 더미 영수증(디자인 확인용). orderId를 음수로 둬서
//   실제 서버 orderId(양수)와 절대 안 겹치게 함 — 나중에 실제 주문이 생기면 이 더미는
//   자동으로 화면에서 사라집니다.
function buildDummyOrders(): Order[] {
  const now = new Date();
  const mk = (offsetDays: number, id: number, amount: number, items: Order["items"]): Order => {
    const d = new Date(now);
    d.setDate(d.getDate() - offsetDays);
    return {
      orderId: -id,
      totalAmount: amount,
      status: "PAID",
      orderedAt: d.toISOString(),
      paymentMethod: "카드결제",
      pointsUsed: 0,
      pointsEarned: Math.floor(amount * 0.02),
      items,
    };
  };
  return [
    mk(2, 1, 24800, [
      { skuId: -1, productName: "무항생제 계란 30구", priceKrw: 8900, quantity: 1 },
      { skuId: -2, productName: "삼겹살 900g", priceKrw: 15900, quantity: 1 },
    ]),
    mk(9, 2, 13400, [{ skuId: -3, productName: "제주 삼다수 2L x 12", priceKrw: 13400, quantity: 1 }]),
    mk(34, 3, 41200, [
      { skuId: -4, productName: "휴지 30롤", priceKrw: 21900, quantity: 1 },
      { skuId: -5, productName: "세탁세제 3L", priceKrw: 12800, quantity: 1 },
      { skuId: -6, productName: "바나나 1송이", priceKrw: 6500, quantity: 1 },
    ]),
  ];
}

const selectClass =
  "h-9 rounded-sm border border-border bg-background pl-3 pr-7 text-sm text-foreground outline-none focus-visible:border-brand appearance-none";

export default function ReceiptsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | typeof ALL_MONTHS>(ALL_MONTHS);

  useEffect(() => {
    apiFetch<Order[]>("/api/orders")
      .then(setOrders)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  // 실제 주문이 하나도 없을 때만 더미로 채움(디자인 확인용).
  const displayOrders = orders.length > 0 ? orders : loading ? [] : buildDummyOrders();

  const yearOptions = useMemo(() => {
    const years = new Set(displayOrders.filter((o) => o.orderedAt).map((o) => new Date(o.orderedAt!).getFullYear()));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [displayOrders]);

  useEffect(() => {
    if (year == null && yearOptions.length > 0) setYear(yearOptions[0]);
  }, [year, yearOptions]);

  const filteredOrders = displayOrders.filter((o) => {
    if (!o.orderedAt) return true;
    const d = new Date(o.orderedAt);
    if (year != null && d.getFullYear() !== year) return false;
    if (month !== ALL_MONTHS && d.getMonth() + 1 !== month) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="전자 영수증" />

      {/* ✅ 신규(요청) — 연/월 드롭다운 필터 */}
      <div className="flex gap-2">
        <div className="relative">
          <select
            value={year ?? ""}
            onChange={(e) => setYear(Number(e.target.value))}
            className={selectClass}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <RiArrowDownSLine size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value === ALL_MONTHS ? ALL_MONTHS : Number(e.target.value))}
            className={selectClass}
          >
            <option value={ALL_MONTHS}>전체</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
          <RiArrowDownSLine size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {!loading && loadError && orders.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">영수증을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      )}
      {!loading && !loadError && filteredOrders.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">이 기간엔 영수증이 없어요.</p>
      )}

      <div className="mt-2 divide-y divide-border md:grid md:grid-cols-2 md:gap-4 md:divide-y-0">
        {filteredOrders.map((order) => (
          <button
            key={order.orderId}
            type="button"
            onClick={() => setSelectedOrder(order)}
            className="flex w-full items-center gap-3 py-4 text-left md:rounded-sm md:border md:border-border md:p-4"
          >
            <RiBillLine size={24} className="text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm">주문 #{order.orderId > 0 ? order.orderId : order.orderId * -1}</p>
              <p className="text-xs text-muted-foreground">
                {order.orderedAt
                  ? new Date(order.orderedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
                  : ""}
                {order.orderedAt && " · "}
                {order.items.length}개 품목
              </p>
            </div>
            <span className="text-sm font-medium">{order.totalAmount.toLocaleString()}원</span>
          </button>
        ))}
      </div>

      <ReceiptDialog order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
