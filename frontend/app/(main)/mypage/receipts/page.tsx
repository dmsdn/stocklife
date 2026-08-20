// app/(main)/mypage/receipts/page.tsx
// ✅ 별도 목업 대신 실제 주문 데이터(GET /api/orders)를 영수증 목록으로 보여주고, 상세는
//   구매내역 상세 화면(/mypage/orders/[id])을 그대로 재사용합니다 — 영수증도 결국 그 주문의
//   내역이라 화면을 따로 둘 필요가 없었습니다.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { apiFetch } from "@/lib/api-client";

interface Order {
  orderId: number;
  totalAmount: number;
  status: string;
  items: { skuId: number; productName: string; priceKrw: number; quantity: number }[];
}

export default function ReceiptsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Order[]>("/api/orders")
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-md p-4 md:max-w-3xl md:p-8">
      <SubpageHeader title="전자 영수증" />

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {!loading && orders.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">영수증이 없어요.</p>
      )}

      <div className="divide-y divide-border md:grid md:grid-cols-2 md:gap-4 md:divide-y-0">
        {orders.map((order) => (
          <Link
            key={order.orderId}
            href={`/mypage/orders/${order.orderId}`}
            className="flex items-center gap-3 py-4 md:rounded-sm md:border md:border-border md:p-4"
          >
            <Receipt size={20} className="text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm">주문 #{order.orderId}</p>
              <p className="text-xs text-muted-foreground">{order.items.length}개 품목</p>
            </div>
            <span className="text-sm font-medium">{order.totalAmount.toLocaleString()}원</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
