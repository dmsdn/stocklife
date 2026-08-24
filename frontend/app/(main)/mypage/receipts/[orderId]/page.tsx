// app/(main)/mypage/receipts/[orderId]/page.tsx
// ✅ 직접 링크로 들어온 경우에도 전자 영수증은 항상 모달로 표시. 닫으면 이전 화면(목록)으로.
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { MOCK_ORDERS } from "@/lib/mock-orders";
import { ReceiptDialog } from "@/components/domain/receipt-dialog";

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
  orderedAt?: string;
  paymentMethod?: string;
}

export default function ReceiptDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = Number(params.orderId);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    apiFetch<Order[]>("/api/orders")
      .then((orders) => {
        const source = orders.length > 0 ? orders : MOCK_ORDERS;
        setOrder(source.find((o) => o.orderId === orderId) ?? null);
      })
      .catch(() => setOrder(MOCK_ORDERS.find((o) => o.orderId === orderId) ?? null));
  }, [orderId]);

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      {!order && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      <ReceiptDialog order={order} onClose={() => router.push("/mypage/receipts")} />
    </div>
  );
}
