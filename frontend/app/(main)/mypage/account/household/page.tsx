// app/(main)/mypage/account/household/page.tsx
// ✅ 가구원 수뿐 아니라 반려동물/자녀/자차 질문도 전부 회원가입 화면과 동일한 스타일로
//   통일했습니다. 회원가입 흐름에선 이 네 질문이 각자 별도 페이지(ProfileStep)라 이 한
//   페이지에 그대로 담을 순 없지만, 제목 위치(뒤로가기 화살표 + pt-59), 선택 버튼
//   (ProfileChoice 재사용), 하단 저장 버튼(h-60, 좌우 텍스트 폭 맞춤 원형 알약,
//   StickyBottomBar)은 회원가입과 완전히 동일한 컴포넌트/규격을 그대로 씁니다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiArrowLeftLine } from "@remixicon/react";
import { ProfileChoice } from "@/components/domain/profile-step";
import { Button } from "@/components/ui/button";
import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";
import { getMyProfile, updateMyProfile } from "@/lib/consumer-api";

function QuestionBlock({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-10 space-y-[11px]">
      <h1 className="text-2xl font-bold leading-8">{title}</h1>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default function AccountHouseholdPage() {
  const router = useRouter();
  const [householdSize, setHouseholdSize] = useState<number | null>(null);
  const [hasPet, setHasPet] = useState<boolean | null>(null);
  const [hasChild, setHasChild] = useState<boolean | null>(null);
  const [byCar, setByCar] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✅ 신규(요청) — 정보 수정 화면은 하단 탭바 숨김.
  const { setHidden } = useBottomBarVisibility();
  useEffect(() => {
    setHidden(true);
    return () => setHidden(false);
  }, [setHidden]);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setHouseholdSize(p.householdSize);
        setHasPet(p.hasPet);
        setHasChild(p.hasChild);
        setByCar(p.byCar);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMyProfile({ householdSize, hasPet, hasChild, byCar });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-[140px] pt-[59px]">
      <div className="flex h-8 items-center">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-muted"
          aria-label="이전"
        >
          <RiArrowLeftLine size={20} />
        </button>
      </div>

      {loading ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : (
        <>
          <QuestionBlock title={<>함께 사는 가족은<br />몇 명인가요?</>}>
            <ProfileChoice selected={householdSize === 1} onClick={() => setHouseholdSize(1)}>1명</ProfileChoice>
            <ProfileChoice selected={householdSize === 2} onClick={() => setHouseholdSize(2)}>2명</ProfileChoice>
            <ProfileChoice selected={householdSize === 3} onClick={() => setHouseholdSize(3)}>3명</ProfileChoice>
            <ProfileChoice selected={householdSize === 4} onClick={() => setHouseholdSize(4)}>4명</ProfileChoice>
            <ProfileChoice selected={householdSize === 5} onClick={() => setHouseholdSize(5)}>5명 이상</ProfileChoice>
          </QuestionBlock>

          <QuestionBlock title={<>반려동물을<br />키우시나요?</>}>
            <ProfileChoice selected={hasPet === true} onClick={() => setHasPet(true)}>예</ProfileChoice>
            <ProfileChoice selected={hasPet === false} onClick={() => setHasPet(false)}>아니오</ProfileChoice>
          </QuestionBlock>

          <QuestionBlock title={<>자녀가<br />있으신가요?</>}>
            <ProfileChoice selected={hasChild === true} onClick={() => setHasChild(true)}>예</ProfileChoice>
            <ProfileChoice selected={hasChild === false} onClick={() => setHasChild(false)}>아니오</ProfileChoice>
          </QuestionBlock>

          <QuestionBlock title={<>차로 장을 보러<br />오시나요?</>}>
            <ProfileChoice selected={byCar === true} onClick={() => setByCar(true)}>예</ProfileChoice>
            <ProfileChoice selected={byCar === false} onClick={() => setByCar(false)}>아니오</ProfileChoice>
          </QuestionBlock>
        </>
      )}

      <StickyBottomBar>
        <Button
          className="flex mx-auto h-[60px] w-fit px-5 rounded-full shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
          disabled={saving || loading}
          onClick={handleSave}
        >
          {saving ? "저장 중..." : "저장"}
        </Button>
      </StickyBottomBar>
    </div>
  );
}
