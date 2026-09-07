// app/(main)/mypage/coupons/page.tsx
// ✅ 전면 재작성 — 이전 파일은 실제 API(`/api/coupons/me`, 백엔드에 없음)를 부르는
//   코드와 목업 fetchCoupons()를 부르는 코드가 그대로 같이 붙어있어서 useEffect/useState가
//   중복 선언돼 있었고(import까지 두 번), 존재하지 않는 Coupon 타입/fetchCoupons 함수를
//   참조해 컴파일이 안 되는 상태였습니다.
// ⚠ 쿠폰은 이 백엔드가 아니라 별도 시스템에서 처리하기로 결정됨 — 그래서 실제 API 호출을
//   걷어내고 전부 목업 데이터로 통일했습니다. 나중에 쿠폰 서버 API가 정해지면
//   MOCK_COUPONS 자리를 그 응답으로 바꾸면 됩니다.
// ✅ 하드코딩 색상(#F7F7F8, #111111 등) 대신 프로젝트 디자인 토큰(bg-muted, bg-foreground
//   등)으로, radius도 프로젝트 컨벤션(담는 요소 rounded-sm=8px)으로 맞췄습니다.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiArrowRightSLine, RiCoupon3Line } from "@remixicon/react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { fetchCoupons, type Coupon } from "@/lib/coupons-mock";

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchCoupons().then((list) => {
      setCoupons(list);
      setLoaded(true);
    });
  }, []);

  const availableCount = coupons.filter((c) => c.usable).length;

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="쿠폰" />

      <div className="flex items-center gap-3 rounded-sm border border-border p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <RiCoupon3Line size={20} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">사용 가능한 쿠폰</p>
          <p className="mt-0.5 text-xl font-bold">
            {availableCount}
            <span className="ml-1 text-sm font-medium">장</span>
          </p>
        </div>
      </div>

      <h2 className="mt-6 text-base font-semibold">내 쿠폰</h2>

      {loaded && coupons.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">보유한 쿠폰이 없어요.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {coupons.map((coupon) => {
            const expiry = new Date(coupon.validUntil).toLocaleDateString("ko-KR");
            const statusText =
              coupon.status === "AVAILABLE" ? "사용 가능" : coupon.status === "USED" ? "사용 완료" : "기간 만료";

            return (
              <div
                key={coupon.consumerCouponId}
                className={`flex overflow-hidden rounded-sm border border-border ${coupon.usable ? "" : "opacity-50"}`}
              >
                <div className="flex w-16 shrink-0 items-center justify-center bg-foreground text-background">
                  <RiCoupon3Line size={22} />
                </div>
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{coupon.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{coupon.description}</p>
                      <p className="mt-3 text-md text-muted-foreground">
                        {expiry}까지 · {statusText}
                      </p>
                    </div>

                    {coupon.usable && (
                      <Link href="/cart" className="shrink-0 flex items-center gap-0.5 text-xs font-medium">
                        장바구니에서 사용
                        <RiArrowRightSLine size={16} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
