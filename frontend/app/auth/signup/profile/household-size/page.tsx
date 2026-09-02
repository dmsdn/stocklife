"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ProfileStep, ProfileChoice } from "@/components/domain/profile-step";
import { readSignupDraft, writeSignupDraft } from "@/lib/signup-draft";

type HouseholdSize = 1 | 2 | 3 | 4 | 5;

function SignupHouseholdSizePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editMode = searchParams.get("edit") === "1";

  const [name, setName] = useState<string | null>(null);
  const [value, setValue] = useState<HouseholdSize | null | undefined>(undefined);

  useEffect(() => {
    const draft = readSignupDraft();
    setName(draft.name ?? null);
    setValue(draft.householdSize ?? (draft.householdSize === null ? null : undefined));
  }, []);

  const handleNext = () => {
    writeSignupDraft({ householdSize: value ?? null });
    router.push(editMode ? "/auth/signup/profile/confirm" : "/auth/signup/profile/pet");
  };

  return (
    <ProfileStep
      title="함께 사는 가족은 몇 명인가요?"
      description={`정보를 입력해주시면\n${name ?? "회원"} 님을 위해 더 많은 정보를 추천해드릴 수 있어요`}
      onBack={() => router.push("/auth/signup/profile/gender")}
      nextDisabled={value === undefined}
      nextLabel={editMode ? "수정 완료" : "다음"}
      onNext={handleNext}
    >
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <ProfileChoice key={n} selected={value === n} onClick={() => setValue(n)}>
          {n === 5 ? "5인 이상" : `${n}인`}
        </ProfileChoice>
      ))}
      <ProfileChoice selected={value === null} onClick={() => setValue(null)}>
        건너뛰기
      </ProfileChoice>
    </ProfileStep>
  );
}

export default function SignupHouseholdSizePage() {
  return (
    <Suspense fallback={<div className="min-h-full" />}>
      <SignupHouseholdSizePageInner />
    </Suspense>
  );
}
