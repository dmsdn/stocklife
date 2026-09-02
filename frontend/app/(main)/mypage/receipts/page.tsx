// app/(main)/mypage/receipts/page.tsx
// ✅ 구매내역과 별개 화면이 아니라 이게 유일한 목록입니다(실제 주문 데이터 GET /api/orders).
//   누르면 전자 영수증을 모달로 바로 띄워서 보여줍니다(페이지 이동 없음).
"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { ReceiptDialog } from "@/components/domain/receipt-dialog";
import { apiFetch } from "@/lib/api-client";
import { MOCK_ORDERS } from "@/lib/mock-orders";

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
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    // ✅ 실제 GET /api/orders 연동. 결과가 비어있거나(시드데이터 없음) 요청이 실패하면
    //   (백엔드 미기동 등) 목업 영수증 3건으로 자동 대체 — 화면을 바로 확인할 수 있게.
    apiFetch<Order[]>("/api/orders")
      .then((data) => setOrders(data.length > 0 ? data : MOCK_ORDERS))
      .catch(() => setOrders(MOCK_ORDERS))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="전자 영수증" />

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {!loading && orders.length === 0 && (
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
            <Receipt size={24} className="text-muted-foreground" />
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
