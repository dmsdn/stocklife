// app/(main)/mypage/orders/[orderId]/page.tsx
// ⚠ 백엔드에 주문 단건 조회(GET /api/orders/{id})가 있는지 확인 못 해서, 안전하게 목록
//   API(GET /api/orders)를 받아 그 안에서 id로 찾는 방식으로 만들었습니다. 단건 조회 API가
//   확인되면 그걸로 바로 바꾸면 됩니다.
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = Number(params.orderId);

  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<Order[]>("/api/orders")
      .then((orders) => setOrder(orders.find((o) => o.orderId === orderId) ?? null))
      .catch(() => setOrder(null));
  }, [orderId]);

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title={`주문 #${orderId}`} />

      {order === undefined && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {order === null && <p className="py-10 text-center text-sm text-muted-foreground">주문 내역을 찾을 수 없어요.</p>}

      {order && (
        <>
          <div className="mb-4 flex items-center justify-between rounded-md bg-muted px-4 py-3 text-sm">
            <span>결제 상태</span>
            <span className="font-medium">{order.status === "PAID" ? "결제완료" : order.status}</span>
          </div>

          <div className="divide-y divide-border">
            {order.items.map((item) => (
              <div key={item.skuId} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p>{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.priceKrw.toLocaleString()}원 × {item.quantity}
                  </p>
                </div>
                <span className="font-medium">{(item.priceKrw * item.quantity).toLocaleString()}원</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-base font-semibold">
            <span>총 결제금액</span>
            <span>{order.totalAmount.toLocaleString()}원</span>
          </div>
        </>
      )}
    </div>
  );
}
