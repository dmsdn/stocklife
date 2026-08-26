"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Coins } from "lucide-react";
import { fetchPointBalance, fetchPointHistory, type PointBalance, type PointHistoryItem } from "@/lib/consumer-benefits";

export default function PointsPage() {
  const [balance, setBalance] = useState<PointBalance | null>(null);
  const [history, setHistory] = useState<PointHistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([fetchPointBalance(), fetchPointHistory()]).then(([b, h]) => {
      setBalance(b);
      setHistory(h);
      setLoaded(true);
    });
  }, []);

  return (
    <main className="min-h-screen bg-white pb-24">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-white px-5">
        <Link href="/mypage" className="flex h-10 w-10 items-center justify-center rounded-full" aria-label="뒤로가기">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-center text-[17px] font-semibold">포인트</h1>
        <div className="w-10" />
      </header>

      <section className="px-5 pt-6">
        <div className="rounded-sm bg-[#F6F7F9] p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Coins className="h-4 w-4" />
            보유 포인트
          </div>

          {!loaded ? (
            <p className="mt-3 text-sm text-gray-400">불러오는 중...</p>
          ) : balance ? (
            <>
              <div className="mt-3 flex items-end gap-1">
                <strong className="text-[32px] font-bold tracking-tight">{balance.balance.toLocaleString()}</strong>
                <span className="mb-1 text-sm font-medium">P</span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                <span>이번 달 적립 {balance.earnedThisMonth.toLocaleString()}P</span>
                <span>이번 달 사용 {balance.usedThisMonth.toLocaleString()}P</span>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-gray-400">포인트 정보를 불러올 수 없어요.</p>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-[17px] font-semibold">포인트 내역</h2>

          {loaded && history.length === 0 && (
            <p className="mt-6 text-center text-sm text-gray-400">내역이 없어요.</p>
          )}

          <div className="mt-4 divide-y">
            {history.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-gray-400">{item.createdAt}</p>
                </div>
                <span className={`text-sm font-semibold ${item.amount > 0 ? "text-[#111111]" : "text-gray-400"}`}>
                  {item.amount > 0 ? "+" : ""}
                  {item.amount.toLocaleString()}P
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
