// app/(main)/mypage/account/household/page.tsx
// ✅ 가구원 수뿐 아니라 반려동물/자녀/자차 질문도 전부 회원가입 화면과 동일한 스타일
//   (큰 제목 + 전체너비 예/아니오 버튼)로 통일했습니다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Button } from "@/components/ui/button";
import { getMyProfile, updateMyProfile } from "@/lib/consumer-api";

function ChoiceButton({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-full items-center justify-start rounded-sm border px-4 text-left text-sm font-medium transition ${
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground/65 hover:bg-muted/40"
      }`}
    >
      {children}
    </button>
  );
}

function QuestionBlock({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-10 space-y-7">
      <h1 className="text-2xl font-semibold leading-snug">{title}</h1>
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
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="가구원 수" />
      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : (
        <>
          <QuestionBlock title={<>함께 사는 가족은<br />몇 명인가요?</>}>
            <ChoiceButton selected={householdSize === 1} onClick={() => setHouseholdSize(1)}>1명</ChoiceButton>
            <ChoiceButton selected={householdSize === 2} onClick={() => setHouseholdSize(2)}>2명</ChoiceButton>
            <ChoiceButton selected={householdSize === 3} onClick={() => setHouseholdSize(3)}>3명</ChoiceButton>
            <ChoiceButton selected={householdSize === 4} onClick={() => setHouseholdSize(4)}>4명</ChoiceButton>
            <ChoiceButton selected={householdSize === 5} onClick={() => setHouseholdSize(5)}>5명 이상</ChoiceButton>
          </QuestionBlock>

          <QuestionBlock title={<>반려동물을<br />키우시나요?</>}>
            <ChoiceButton selected={hasPet === true} onClick={() => setHasPet(true)}>예</ChoiceButton>
            <ChoiceButton selected={hasPet === false} onClick={() => setHasPet(false)}>아니오</ChoiceButton>
          </QuestionBlock>

          <QuestionBlock title={<>자녀가<br />있으신가요?</>}>
            <ChoiceButton selected={hasChild === true} onClick={() => setHasChild(true)}>예</ChoiceButton>
            <ChoiceButton selected={hasChild === false} onClick={() => setHasChild(false)}>아니오</ChoiceButton>
          </QuestionBlock>

          <QuestionBlock title={<>차로 장을 보러<br />오시나요?</>}>
            <ChoiceButton selected={byCar === true} onClick={() => setByCar(true)}>예</ChoiceButton>
            <ChoiceButton selected={byCar === false} onClick={() => setByCar(false)}>아니오</ChoiceButton>
          </QuestionBlock>

          <Button className="mt-8 w-full" disabled={saving} onClick={handleSave}>
            {saving ? "저장 중..." : "저장"}
          </Button>

        </>
      )}
    </div>
  );
}
