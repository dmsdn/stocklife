"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Coins } from "lucide-react";

export default function PointsPage() {
  return (
    <main className="min-h-screen bg-white pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-white px-5">
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="뒤로가기"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        <h1 className="flex-1 text-center text-[17px] font-semibold">
          포인트
        </h1>

        <div className="w-10" />
      </header>

      <section className="px-5 pt-6">
        {/* Point balance */}
        <div className="rounded-2xl bg-[#F6F7F9] p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Coins className="h-4 w-4" />
            보유 포인트
          </div>

          <div className="mt-3 flex items-end gap-1">
            <strong className="text-[32px] font-bold tracking-tight">
              12,500
            </strong>
            <span className="mb-1 text-sm font-medium">P</span>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>이번 달 적립 2,500P</span>
            <span>이번 달 사용 1,000P</span>
          </div>
        </div>

        {/* Point history */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold">포인트 내역</h2>

            <button className="flex items-center text-xs text-gray-500">
              전체
              <ChevronRight className="ml-0.5 h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 divide-y">
            <PointHistory
              title="구매 완료 적립"
              date="2026.08.20"
              amount="+500P"
              positive
            />

            <PointHistory
              title="추천 상품 구매"
              date="2026.08.18"
              amount="+1,000P"
              positive
            />

            <PointHistory
              title="쿠폰 교환"
              date="2026.08.15"
              amount="-1,000P"
            />

            <PointHistory
              title="출석 적립"
              date="2026.08.12"
              amount="+100P"
              positive
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function PointHistory({
  title,
  date,
  amount,
  positive = false,
}: {
  title: string;
  date: string;
  amount: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-gray-400">{date}</p>
      </div>

      <span
        className={`text-sm font-semibold ${
          positive ? "text-[#111111]" : "text-gray-400"
        }`}
      >
        {amount}
      </span>
    </div>
  );
}