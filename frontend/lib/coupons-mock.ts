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

// ✅ 신규(요청) — 등급 달성 시 지급되는 쿠폰. lib/grade.ts GRADE_TIERS의 benefits 문구
//   ("생일 쿠폰", "무료 배송 쿠폰 월 N회")와 실제로 맞춰서 만든 등급별 쿠폰입니다.
//   등급은 누적(하위 등급 혜택 유지)이라, 쿠폰도 "지금 등급 + 그 아래 등급들"을 다 줍니다.
//   consumerCouponId는 MOCK_COUPONS(1~3)와 안 겹치게 100번대로 뗐습니다.
type GradeKey = "BASIC" | "BRONZE" | "SILVER" | "GOLD";

const GRADE_COUPON_TEMPLATES: Record<Exclude<GradeKey, "BASIC">, Coupon[]> = {
  BRONZE: [
    {
      consumerCouponId: 101,
      code: "BRONZE-BIRTHDAY",
      title: "[Bronze] 생일 쿠폰",
      description: "생일 달에 전 상품 5,000원 할인 (2만원 이상 구매 시)",
      discountType: "FIXED",
      discountValue: 5000,
      minOrderAmount: 20000,
      maxDiscountAmount: null,
      status: "AVAILABLE",
      usable: true,
      validUntil: "2026-12-31",
    },
  ],
  SILVER: [
    {
      consumerCouponId: 102,
      code: "SILVER-FREESHIP",
      title: "[Silver] 무료 배송 쿠폰 (월 1회)",
      description: "이번 달 배송비 무료 — 1회 사용 가능",
      discountType: "FIXED",
      discountValue: 3000,
      minOrderAmount: 0,
      maxDiscountAmount: null,
      status: "AVAILABLE",
      usable: true,
      validUntil: "2026-09-30",
    },
  ],
  GOLD: [
    {
      consumerCouponId: 103,
      code: "GOLD-FREESHIP-1",
      title: "[Gold] 무료 배송 쿠폰 1/2",
      description: "이번 달 배송비 무료 — 월 2회 중 첫 번째",
      discountType: "FIXED",
      discountValue: 3000,
      minOrderAmount: 0,
      maxDiscountAmount: null,
      status: "AVAILABLE",
      usable: true,
      validUntil: "2026-09-30",
    },
    {
      consumerCouponId: 104,
      code: "GOLD-FREESHIP-2",
      title: "[Gold] 무료 배송 쿠폰 2/2",
      description: "이번 달 배송비 무료 — 월 2회 중 두 번째",
      discountType: "FIXED",
      discountValue: 3000,
      minOrderAmount: 0,
      maxDiscountAmount: null,
      status: "AVAILABLE",
      usable: true,
      validUntil: "2026-09-30",
    },
    {
      consumerCouponId: 105,
      code: "GOLD-VIP15",
      title: "[Gold] VIP 15% 할인",
      description: "전 상품 최대 10,000원까지, Gold 등급 전용",
      discountType: "PERCENT",
      discountValue: 15,
      minOrderAmount: 30000,
      maxDiscountAmount: 10000,
      status: "AVAILABLE",
      usable: true,
      validUntil: "2026-09-30",
    },
  ],
};

const GRADE_ORDER: GradeKey[] = ["BASIC", "BRONZE", "SILVER", "GOLD"];

/** 지금 등급 + 그 아래 등급들의 쿠폰을 전부 모아서 반환(등급은 누적 혜택이라 쿠폰도 누적). */
function getGradeCoupons(grade: GradeKey): Coupon[] {
  const upToIndex = GRADE_ORDER.indexOf(grade);
  return GRADE_ORDER.slice(1, upToIndex + 1).flatMap(
    (key) => GRADE_COUPON_TEMPLATES[key as Exclude<GradeKey, "BASIC">]
  );
}

export async function fetchCoupons(): Promise<Coupon[]> {
  // ✅ 로그인 상태면 실제 등급(GET /api/consumers/me)에 맞는 등급 쿠폰을 같이 보여줌.
  //   비로그인·조회 실패 시엔 등급 쿠폰 없이 기본 쿠폰만(예전 동작 그대로).
  try {
    const { getMyProfile } = await import("./consumer-api");
    const profile = await getMyProfile();
    return [...getGradeCoupons(profile.grade as GradeKey), ...MOCK_COUPONS];
  } catch {
    return MOCK_COUPONS;
  }
}
