// app/(main)/mypage/receipts/page.tsx
// ✅ 구매내역과 별개 화면이 아니라 이게 유일한 목록입니다(실제 주문 데이터 GET /api/orders).
//   누르면 전자 영수증을 모달로 바로 띄워서 보여줍니다(페이지 이동 없음).
// ✅ 수정(2026-09) — 예전엔 실제 주문이 0건이거나 API 실패 시 목업 영수증 3건으로
//   자동 대체해서, 실제로 아무것도 안 샀는데도 가짜 구매내역이 항상 보였다. 이제
//   실제 데이터만 보여주고, 정말 없으면 "영수증이 없어요"를 솔직하게 표시한다.
"use client";

import { useEffect, useState } from "react";
import { RiBillLine } from "@remixicon/react";
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
}

export default function ReceiptsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    apiFetch<Order[]>("/api/orders")
      .then(setOrders)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="전자 영수증" />

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {!loading && loadError && (
        <p className="py-10 text-center text-sm text-muted-foreground">영수증을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      )}
      {!loading && !loadError && orders.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">영수증이 없어요.</p>
      )}

      <div className="divide-y divide-border md:grid md:grid-cols-2 md:gap-4 md:divide-y-0">
        {orders.map((order) => (
          <button
            key={order.orderId}
            type="button"
            onClick={() => setSelectedOrder(order)}
            className="flex w-full items-center gap-3 py-4 text-left md:rounded-sm md:border md:border-border md:p-4"
          >
            <RiBillLine size={24} className="text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm">주문 #{order.orderId}</p>
              <p className="text-xs text-muted-foreground">{order.items.length}개 품목</p>
            </div>
            <span className="text-sm font-medium">{order.totalAmount.toLocaleString()}원</span>
          </button>
        ))}
      </div>

      <ReceiptDialog order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
