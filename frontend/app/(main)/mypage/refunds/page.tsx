// ⚠ 실제 결제 로직을 안 만들기로 결정되면서 이 화면은 스코프 밖이 되었었는데,
//   /refund/request·/refund/approve API와 GET /api/orders의 status 필드가 실제로
//   있는 걸 확인해서 연결했습니다. 별도의 "환불 목록" API는 없고, 주문 목록에서
//   상태가 REFUND_REQUESTED/REFUNDED인 것만 걸러서 씁니다.
"use client";

import { useEffect, useState } from "react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

interface Order {
  orderId: number;
  totalAmount: number;
  status: string;
  items: { productName: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  PAID: "결제완료",
  REFUND_REQUESTED: "반품접수",
  REFUNDED: "환불완료",
};

export default function RefundsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<number | null>(null);

  const load = () => {
    apiFetch<Order[]>("/api/orders")
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRequestRefund = async (orderId: number) => {
    setRequesting(orderId);
    try {
      await apiFetch(`/api/orders/${orderId}/refund/request`, { method: "POST" });
      load();
    } catch {
      load();
    } finally {
      setRequesting(null);
    }
  };

  const refundable = orders.filter((o) => o.status === "PAID");
  const history = orders.filter((o) => o.status !== "PAID");

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="취소 / 반품 / 환불 내역" />

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}

      {!loading && refundable.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold">환불 가능한 주문</p>
          <div className="divide-y divide-border">
            {refundable.map((o) => (
              <div key={o.orderId} className="flex items-center justify-between py-3">
                <span className="text-sm">주문 #{o.orderId} · {o.totalAmount.toLocaleString()}원</span>
                <Button
                  variant="outline"
                  disabled={requesting === o.orderId}
                  onClick={() => handleRequestRefund(o.orderId)}
                >
                  {requesting === o.orderId ? "요청 중..." : "환불 요청"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && history.length === 0 && refundable.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">취소·반품·환불 내역이 없어요.</p>
      )}

      <div className="divide-y divide-border md:grid md:grid-cols-2 md:gap-4 md:divide-y-0">
        {history.map((o) => (
          <div key={o.orderId} className="py-4 md:rounded-sm md:border md:border-border md:p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>주문 #{o.orderId}</span>
              <span>{STATUS_LABEL[o.status] ?? o.status}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm">{o.items[0]?.productName ?? ""}{o.items.length > 1 ? ` 외 ${o.items.length - 1}건` : ""}</span>
              <span className="text-base font-medium">{o.totalAmount.toLocaleString()}원</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
