// lib/coupons-mock.ts
// ✅ 쿠폰은 이 백엔드가 아니라 별도 시스템에서 처리하기로 결정돼서, 전부 목업으로
//   통일합니다. 예전엔 mypage/coupons/page.tsx가 존재하지 않는 "/api/coupons/me"를,
//   cart/page.tsx가 또 다른 모양의 "/api/coupons/me"를, 이 파일(당시 이름
//   consumer-benefits.ts)이 "/api/consumers/coupons"를 — 세 군데가 각자 다른 타입/경로로
//   쿠폰을 부르고 있었습니다. 이 파일 하나로 합쳐서 두 화면이 같은 데이터를 씁니다.
//   나중에 쿠폰 시스템의 실제 API가 정해지면 fetchCoupons() 안쪽만 실제 호출로 바꾸면 됩니다.
//   포인트/등급 관련 코드는 이 파일에서 제거했습니다 — 그건 이제 실제 데이터라
//   /api/consumers/me(lib/consumer-api.ts의 getMyProfile)에서 직접 받습니다.
"use client";

export interface Coupon {
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

export const MOCK_COUPONS: Coupon[] = [
  {
    consumerCouponId: 1,
    code: "FRESH3000",
    title: "신선식품 3,000원 할인",
    description: "3만원 이상 구매 시 사용 가능",
    discountType: "FIXED",
    discountValue: 3000,
    minOrderAmount: 30000,
    maxDiscountAmount: null,
    status: "AVAILABLE",
    usable: true,
    validUntil: "2026-09-30",
  },
  {
    consumerCouponId: 2,
    code: "WELCOME10",
    title: "첫 구매 10% 할인",
    description: "전 상품 최대 5,000원까지",
    discountType: "PERCENT",
    discountValue: 10,
    minOrderAmount: 0,
    maxDiscountAmount: 5000,
    status: "AVAILABLE",
    usable: true,
    validUntil: "2026-09-15",
  },
  {
    consumerCouponId: 3,
    code: "DAILY2000",
    title: "생활용품 2,000원 할인",
    description: "1만원 이상 구매 시 사용 가능",
    discountType: "FIXED",
    discountValue: 2000,
    minOrderAmount: 10000,
    maxDiscountAmount: null,
    status: "EXPIRED",
    usable: false,
    validUntil: "2026-08-20",
  },
];

export async function fetchCoupons(): Promise<Coupon[]> {
  return MOCK_COUPONS;
}
