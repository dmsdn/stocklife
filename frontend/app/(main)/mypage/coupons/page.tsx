"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, Ticket } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface CouponItem {
  consumerCouponId: number;
  code: string;
  title: string;
  description: string;
  discountType: "FIXED" | "PERCENT";
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  status: "AVAILABLE" | "USED" | "EXPIRED";
  usable: boolean;
  validUntil: string;
}

interface CouponSummary {
  availableCount: number;
  coupons: CouponItem[];
}

export default function CouponsPage() {
  const [data, setData] = useState<CouponSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CouponSummary>("/api/coupons/me")
      .then(setData)
      .catch(() => setError("쿠폰 정보를 불러오지 못했어요."))
      .finally(() => setLoading(false));
  }, []);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchCoupons().then((list) => {
      setCoupons(list);
      setLoaded(true);
    });
  }, []);

  const usable = coupons.filter((c) => !c.used);

  return (
    <main className="min-h-screen bg-[#F7F7F8] pb-24">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-white px-5">
        <Link href="/mypage" className="flex h-10 w-10 items-center justify-center rounded-full" aria-label="뒤로가기">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-center text-[17px] font-semibold">쿠폰</h1>
        <div className="w-10" />
      </header>

      <section className="bg-white px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F3F4F6]">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500">사용 가능한 쿠폰</p>
            <p className="mt-0.5 text-xl font-bold">
              {data?.availableCount ?? 0}<span className="ml-1 text-sm font-medium">장</span>
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 pt-5">
        <h2 className="text-[17px] font-semibold">내 쿠폰</h2>
        {loading && <p className="py-10 text-center text-sm text-gray-500">불러오는 중...</p>}
        {error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}
        {!loading && !error && data?.coupons.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">보유한 쿠폰이 없어요.</p>
        )}

        {loaded && coupons.length === 0 && (
          <p className="mt-6 text-center text-sm text-gray-400">보유한 쿠폰이 없어요.</p>
        )}

        <div className="mt-4 space-y-3">
          {data?.coupons.map((coupon) => {
            const expiry = new Date(coupon.validUntil).toLocaleDateString("ko-KR");
            const statusText = coupon.usable ? "사용 가능" : coupon.status === "USED" ? "사용 완료" : "기간 만료";
            return (
              <div key={coupon.consumerCouponId} className={`overflow-hidden rounded-2xl bg-white ${coupon.usable ? "" : "opacity-55"}`}>
                <div className="flex">
                  <div className="flex w-20 shrink-0 items-center justify-center bg-[#111111] text-white">
                    <Ticket className="h-6 w-6" />
                  </div>
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">{coupon.title}</h3>
                        <p className="mt-1 text-xs text-gray-500">{coupon.description}</p>
                        <p className="mt-3 text-[11px] text-gray-400">{expiry}까지 · {statusText}</p>
                      </div>
                      {coupon.usable && (
                        <Link href="/cart" className="shrink-0 text-xs font-medium">장바구니에서 사용</Link>
                      )}
                    </div>
                    {!coupon.used && (
                      <button type="button" className="flex shrink-0 items-center text-xs font-medium">
                        사용하기
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
