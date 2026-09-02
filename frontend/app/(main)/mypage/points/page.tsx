// app/(main)/mypage/points/page.tsx
// ✅ 백엔드에 포인트 거래내역 API(GET /api/points/history)가 새로 생겨서 실제 내역 연동.
//   예전엔 이 테이블 자체가 없어서 "준비 중"이라고 정직하게 표시만 해뒀었습니다.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiArrowLeftSLine, RiCoinLine } from "@remixicon/react";
import { getMyProfile } from "@/lib/consumer-api";
import { apiFetch } from "@/lib/api-client";

interface PointTransaction {
  pointTransactionId: number;
  orderId: number | null;
  type: "EARN" | "USE" | "REFUND_USE" | "REVERSE_EARN";
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

const TYPE_LABEL: Record<PointTransaction["type"], string> = {
  EARN: "적립",
  USE: "사용",
  REFUND_USE: "환불로 복구",
  REVERSE_EARN: "적립 취소",
};

export default function PointsPage() {
  const [pointBalance, setPointBalance] = useState<number | null>(null);
  const [pointEarnedTotal, setPointEarnedTotal] = useState<number | null>(null);
  const [history, setHistory] = useState<PointTransaction[] | null>(null);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setPointBalance(p.pointBalance);
        setPointEarnedTotal(p.pointEarnedTotal);
      })
      .catch(() => {
        setPointBalance(0);
        setPointEarnedTotal(0);
      });

    apiFetch<PointTransaction[]>("/api/points/history")
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  const loading = pointBalance === null;

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border bg-background px-4">
        <Link href="/mypage" className="flex h-10 w-10 items-center justify-center rounded-full" aria-label="뒤로가기">
          <RiArrowLeftSLine size={20} />
        </Link>
        <h1 className="flex-1 text-center text-base font-semibold">포인트</h1>
        <div className="w-10" />
      </header>

      <section className="px-4 pt-6">
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
        ) : (
          <>
            <div className="rounded-sm border border-border p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RiCoinLine size={18} />
                사용 가능 포인트
              </div>

              <div className="mt-3 flex items-end gap-1">
                <strong className="text-37 font-bold tracking-tight">
                  {pointBalance!.toLocaleString()}
                </strong>
                <span className="mb-1 text-sm font-medium">P</span>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                누적 적립 {pointEarnedTotal!.toLocaleString()}P · 결제 금액의 2% 적립
              </p>
            </div>

            <div className="mt-8">
              <h2 className="text-base font-semibold">포인트 내역</h2>

              {history === null ? (
                <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
              ) : history.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">아직 포인트 내역이 없어요.</p>
              ) : (
                <div className="mt-2 divide-y divide-border">
                  {history.map((item) => {
                    const positive = item.amount > 0;
                    const date = new Date(item.createdAt).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    });
                    return (
                      <div key={item.pointTransactionId} className="flex items-center justify-between py-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {item.description || TYPE_LABEL[item.type]}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {date}
                            {item.orderId ? ` · 주문 #${item.orderId}` : ""}
                          </p>
                        </div>
                        <span className={`shrink-0 text-sm font-semibold ${positive ? "" : "text-muted-foreground"}`}>
                          {positive ? "+" : ""}
                          {item.amount.toLocaleString()}P
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
