// lib/grade.ts
// ✅ 백엔드 Grade enum(BASIC/BRONZE/SILVER/GOLD) 기준. threshold는 "이번 달 누적 결제금액"
//   기준이며 실제 계산은 서버(GradeResetScheduler)가 매달 하는 것으로 확인했습니다.
//   혜택 문구는 백엔드에 없어서 화면용으로 만든 목업입니다.
export interface GradeTier {
  key: "BASIC" | "BRONZE" | "SILVER" | "GOLD";
  label: string;
  threshold: number; // 이번 달 누적 결제금액(원) 기준
  benefits: string[];
}

export const GRADE_TIERS: GradeTier[] = [
  { key: "BASIC", label: "베이직", threshold: 0, benefits: ["기본 적립 1%"] },
  { key: "BRONZE", label: "브론즈", threshold: 50_000, benefits: ["적립 1.5%", "생일 쿠폰"] },
  { key: "SILVER", label: "실버", threshold: 100_000, benefits: ["적립 2%", "생일 쿠폰", "무료 배송 쿠폰 월 1회"] },
  { key: "GOLD", label: "골드", threshold: 150_000, benefits: ["적립 3%", "생일 쿠폰", "무료 배송 쿠폰 월 2회", "우선 입고 알림"] },
];

export function calculateGrade(monthlySpend: number): GradeTier {
  return [...GRADE_TIERS].reverse().find((t) => monthlySpend >= t.threshold) ?? GRADE_TIERS[0];
}
