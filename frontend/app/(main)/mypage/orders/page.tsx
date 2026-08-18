// app/(main)/mypage/orders/page.tsx
"use client";

import { useEffect, useState } from "react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { apiFetch } from "@/lib/api-client";

interface OrderItem {
  skuId: number;
  productName: string;
  priceKrw: number;
  quantity: number;
}

interface Order {
  orderId: number;
  totalAmount: number;
  status: string;
  items: OrderItem[];
}

export default function OrdersPage() {
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
      <SubpageHeader title="구매내역" />

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {!loading && orders.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">구매내역이 없어요.</p>
      )}

      <div className="divide-y divide-border md:grid md:grid-cols-2 md:gap-4 md:divide-y-0">
        {orders.map((order) => (
          <div key={order.orderId} className="py-4 md:rounded-lg md:border md:border-border md:p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>주문 #{order.orderId}</span>
              <span>{order.status === "PAID" ? "결제완료" : order.status}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm">{order.items.length}개 품목</span>
              <span className="text-base font-medium">{order.totalAmount.toLocaleString()}원</span>
            </div>
            <ul className="mt-2 space-y-1">
              {order.items.map((item) => (
                <li key={item.skuId} className="text-xs text-muted-foreground">
                  {item.productName} × {item.quantity}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
