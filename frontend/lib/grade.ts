// lib/grade.ts
// ✅ 백엔드 Grade enum(BASIC/BRONZE/SILVER/GOLD) 기준 — "이번 달 결제금액" 기준에서
//   "평생 누적 적립 포인트" 기준으로 바뀌었습니다(GradeResetScheduler 폐기, 매달 리셋 없음).
//   threshold도 원(KRW)이 아니라 포인트(P) 단위로 바뀐 실제 백엔드 값입니다
//   (0 / 1,000P / 2,000P / 3,000P — 적립률 2% 기준으로 예전 원화 기준값을 환산한 것).
//   혜택 문구는 백엔드에 없어서 화면용으로 만든 목업입니다.
export interface GradeTier {
  key: "BASIC" | "BRONZE" | "SILVER" | "GOLD";
  label: string;
  threshold: number; // 평생 누적 적립 포인트(P) 기준
  benefits: string[];
}

export const GRADE_TIERS: GradeTier[] = [
  { key: "BASIC", label: "Basic", threshold: 0, benefits: ["기본 적립 2%"] },
  { key: "BRONZE", label: "Bronze", threshold: 1_000, benefits: ["적립 2%", "생일 쿠폰"] },
  { key: "SILVER", label: "Silver", threshold: 2_000, benefits: ["적립 2%", "생일 쿠폰", "무료 배송 쿠폰 월 1회"] },
  { key: "GOLD", label: "Gold", threshold: 3_000, benefits: ["적립 2%", "생일 쿠폰", "무료 배송 쿠폰 월 2회", "우선 입고 알림"] },
];

export function calculateGrade(accumulatedPoints: number): GradeTier {
  return [...GRADE_TIERS].reverse().find((t) => accumulatedPoints >= t.threshold) ?? GRADE_TIERS[0];
}

/** ✅ 등급 아이콘(24x24) 경로 — /public/grade/{basic|bronze|silver|gold}.png 로 넣으면
    이 함수 하나로 모든 화면(마이페이지, 등급 안내, 홈)에 자동 반영됩니다. */
export function gradeIconSrc(key: GradeTier["key"]): string {
  return `/grade/${key.toLowerCase()}.svg`;
}
