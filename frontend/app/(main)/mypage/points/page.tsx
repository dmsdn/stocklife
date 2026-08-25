"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, Coins } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface PointHistoryItem {
  pointHistoryId: number;
  orderId: number;
  amount: number;
  type: "PURCHASE_EARN" | "REFUND_REVOKE";
  description: string;
  createdAt: string;
}

interface PointSummary {
  balance: number;
  earnedThisMonth: number;
  usedThisMonth: number;
  earningRatePercent: number;
  history: PointHistoryItem[];
}

export default function PointsPage() {
  const [data, setData] = useState<PointSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PointSummary>("/api/points/me")
        .then(setData)
        .catch(() => setError("포인트 정보를 불러오지 못했어요."))
        .finally(() => setLoading(false));
  }, []);

  return (
      <main className="min-h-screen bg-white pb-24">
        <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-white px-5">
          <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-full"
              aria-label="뒤로가기"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex-1 text-center text-[17px] font-semibold">포인트</h1>
          <div className="w-10" />
        </header>

        <section className="px-5 pt-6">
          {loading && <p className="py-10 text-center text-sm text-gray-500">불러오는 중...</p>}
          {error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}

          {!loading && !error && data && (
              <>
                <div className="rounded-2xl bg-[#F6F7F9] p-5">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Coins className="h-4 w-4" />
                    보유 포인트
                  </div>

                  <div className="mt-3 flex items-end gap-1">
                    <strong className="text-[32px] font-bold tracking-tight">
                      {data.balance.toLocaleString()}
                    </strong>
                    <span className="mb-1 text-sm font-medium">P</span>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    구매 완료 금액의 {data.earningRatePercent}% 적립
                  </p>

                  <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                    <span>이번 달 적립 {data.earnedThisMonth.toLocaleString()}P</span>
                    <span>이번 달 차감 {data.usedThisMonth.toLocaleString()}P</span>
                  </div>
                </div>

                <div className="mt-8">
                  <h2 className="text-[17px] font-semibold">포인트 내역</h2>

                  {data.history.length === 0 ? (
                      <p className="py-10 text-center text-sm text-gray-400">아직 포인트 내역이 없어요.</p>
                  ) : (
                      <div className="mt-4 divide-y">
                        {data.history.map((item) => (
                            <PointHistory key={item.pointHistoryId} item={item} />
                        ))}
                      </div>
                  )}
                </div>
              </>
          )}
        </section>
      </main>
  );
}

function PointHistory({ item }: { item: PointHistoryItem }) {
  const positive = item.amount > 0;
  const date = new Date(item.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
      <div className="flex items-center justify-between py-4">
        <div>
          <p className="text-sm font-medium">{item.description}</p>
          <p className="mt-1 text-xs text-gray-400">
            {date} · 주문 #{item.orderId}
          </p>
        </div>

        <span className={`text-sm font-semibold ${positive ? "text-[#111111]" : "text-gray-400"}`}>
        {positive ? "+" : ""}{item.amount.toLocaleString()}P
      </span>
      </div>
  );
}