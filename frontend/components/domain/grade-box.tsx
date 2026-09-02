// components/domain/grade-box.tsx
// ✅ 신규 — 원래 내 정보(account/page.tsx)에만 있던 등급 박스를 마이페이지 메인의
//   "멤버십" 영역에서도 그대로 쓸 수 있게 뽑았습니다.
// ⚠ 등급 산정 기준이 "이번 달 결제금액"에서 "평생 누적 적립 포인트"로 바뀌면서
//   진행률 계산이 profile.monthlySpendAmount(더 이상 등급과 무관한 값)를 그대로 쓰고
//   있던 버그를 고쳤습니다 — pointEarnedTotal 기준으로 교체.
import Link from "next/link";
import { GRADE_TIERS, gradeIconSrc } from "@/lib/grade";
import type { ConsumerMe } from "@/lib/consumer-api";

interface GradeBoxProps {
  profile: ConsumerMe | null;
  /** 클릭 시 이동할 경로. 기본은 등급 안내 페이지. */
  href?: string;
}

export function GradeBox({ profile, href = "/mypage/tier-guide" }: GradeBoxProps) {
  if (!profile) return null;

  const currentTierIndex = GRADE_TIERS.findIndex((t) => t.key === profile.grade);
  const currentTier = GRADE_TIERS[Math.max(currentTierIndex, 0)];
  const nextTier = GRADE_TIERS[currentTierIndex + 1];

  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.max(
          0,
          ((profile.pointEarnedTotal - currentTier.threshold) / (nextTier.threshold - currentTier.threshold)) * 100
        )
      )
    : 100;

  return (
    <Link href={href} className="block rounded-sm border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gradeIconSrc(currentTier.key)} alt="" className="h-6 w-6" />
          {currentTier.label} 등급
        </p>
        <p className="text-xs text-muted-foreground">달성 {profile.pointEarnedTotal.toLocaleString()}P</p>
      </div>
      {nextTier ? (
        <>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            다음 등급 &gt; {nextTier.label}까지 {(nextTier.threshold - profile.pointEarnedTotal).toLocaleString()}P 남았어요
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">가장 높은 등급이에요</p>
      )}
    </Link>
  );
}
