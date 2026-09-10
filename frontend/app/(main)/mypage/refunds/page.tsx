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
  const [approveError, setApproveError] = useState<number | null>(null);

  const load = () => {
    apiFetch<Order[]>("/api/orders")
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRequestRefund = async (orderId: number) => {
    setRequesting(orderId);
    setApproveError(null);
    try {
      await apiFetch(`/api/orders/${orderId}/refund/request`, { method: "POST" });
      // ✅ 수정(요청 7번) — 첨부 문서(프론트엔드_환불_재고복구_전달.txt) 반영. request만
      //   부르면 주문 상태만 바뀌고 끝이라 재고/포인트가 안 돌아왔음. 실제 되돌리기
      //   (재고 복구·포인트 취소/반환)는 전부 approve 안에 있어서, request 직후 approve를
      //   이어서 호출해야 함. (원래는 손님 요청→관리자 승인 2단계지만, 승인 화면이 아직
      //   없어서 시연 동안은 "요청 즉시 승인"으로 처리 — 나중에 승인 화면이 생기면 이
      //   두 번째 호출만 빼면 됨.)
      try {
        await apiFetch(`/api/orders/${orderId}/refund/approve`, { method: "POST" });
      } catch {
        // request는 이미 성공했으니 목록은 새로고침하되(화면엔 "반품접수"까지는 반영),
        // 승인 실패는 별도로 알려줌 — 이미 REFUNDED인 주문 등 400 케이스 대응.
        setApproveError(orderId);
      }
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
      <SubpageHeader title="취소/반품/환불" />

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}

      {!loading && refundable.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold">환불 가능한 주문</p>
          <div className="divide-y divide-border">
            {refundable.map((o) => (
              <div key={o.orderId} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">주문 #{o.orderId} · {o.totalAmount.toLocaleString()}원</span>
                  <Button
                    variant="outline"
                    disabled={requesting === o.orderId}
                    onClick={() => handleRequestRefund(o.orderId)}
                  >
                    {requesting === o.orderId ? "요청 중..." : "환불 요청"}
                  </Button>
                </div>
                {approveError === o.orderId && (
                  <p className="mt-1.5 text-xs text-danger">
                    환불 요청은 접수됐지만 자동 승인에는 실패했어요. 잠시 후 다시 시도하거나 고객센터에 문의해주세요.
                  </p>
                )}
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
