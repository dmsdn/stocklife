// components/domain/grade-box.tsx
// ✅ 신규 — 원래 내 정보(account/page.tsx)에만 있던 등급 박스를 마이페이지 메인의
//   "멤버십" 영역에서도 그대로 쓸 수 있게 뽑았습니다. 금액은 항상 숨기고 등급명 +
//   다음 등급까지 진행률 바만 보여줍니다.
import Link from "next/link";
import { GRADE_TIERS } from "@/lib/grade";
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

  // ✅ 금액(profile.monthlySpendAmount)은 화면에 안 보여주고, 진행률 계산에만 내부적으로 씀
  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.max(
          0,
          ((profile.monthlySpendAmount - currentTier.threshold) / (nextTier.threshold - currentTier.threshold)) * 100
        )
      )
    : 100;

  return (
    <Link href={href} className="block rounded-sm border border-border p-4">
      <p className="text-sm font-semibold">{currentTier.label} 등급</p>
      {nextTier ? (
        <>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">다음 등급({nextTier.label})까지 조금 더 남았어요</p>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">가장 높은 등급이에요</p>
      )}
    </Link>
  );
}
