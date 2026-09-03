// app/(main)/mypage/receipts/[orderId]/page.tsx
// ✅ 직접 링크로 들어온 경우에도 전자 영수증은 항상 모달로 표시. 닫으면 이전 화면(목록)으로.
// ✅ 수정(2026-09) — MOCK_ORDERS 폴백 제거. 실제 주문이 없으면(잘못된 orderId 등) 목업으로
//   덮어쓰지 않고 "찾을 수 없음"을 그대로 보여준다(전자영수증은 실제 구매내역만).
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
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
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    apiFetch<Order>(`/api/orders/${orderId}`)
      .then(setOrder)
      .catch(() => setNotFound(true));
  }, [orderId]);

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      {!order && !notFound && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {notFound && <p className="py-10 text-center text-sm text-muted-foreground">영수증을 찾을 수 없어요.</p>}
      <ReceiptDialog order={order} onClose={() => router.push("/mypage/receipts")} />
    </div>
  );
}
