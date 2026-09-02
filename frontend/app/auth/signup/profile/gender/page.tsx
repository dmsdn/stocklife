"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ProfileStep, ProfileChoice } from "@/components/domain/profile-step";
import { readSignupDraft, writeSignupDraft } from "@/lib/signup-draft";

type Gender = "MALE" | "FEMALE";

function SignupGenderPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ✅ 확인 화면(추가정보 요약)에서 이 항목을 눌러 들어온 경우 — 저장 후 다음 단계로
  //   가지 않고 곧장 확인 화면으로 돌아갑니다.
  const editMode = searchParams.get("edit") === "1";

  const [name, setName] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender | null | undefined>(undefined);

  useEffect(() => {
    const draft = readSignupDraft();
    setName(draft.name ?? null);
    setGender(draft.gender === "MALE" || draft.gender === "FEMALE" ? draft.gender : draft.gender === null ? null : undefined);
  }, []);

  const handleNext = () => {
    writeSignupDraft({ gender: gender ?? null });
    router.push(editMode ? "/auth/signup/profile/confirm" : "/auth/signup/profile/household-size");
  };

  return (
    <ProfileStep
      title="성별을 알려주세요"
      description={`정보를 입력해주시면\n${name ?? "회원"} 님을 위해 더 많은 정보를 추천해드릴 수 있어요`}
      onBack={() => router.push("/auth/signup/profile/birth-date")}
      nextDisabled={gender === undefined}
      nextLabel={editMode ? "수정 완료" : "다음"}
      onNext={handleNext}
    >
      <ProfileChoice selected={gender === "FEMALE"} onClick={() => setGender("FEMALE")}>
        여성
      </ProfileChoice>
      <ProfileChoice selected={gender === "MALE"} onClick={() => setGender("MALE")}>
        남성
      </ProfileChoice>
      <ProfileChoice selected={gender === null} onClick={() => setGender(null)}>
        건너뛰기
      </ProfileChoice>
    </ProfileStep>
  );
}

export default function SignupGenderPage() {
  return (
    <Suspense fallback={<div className="min-h-full" />}>
      <SignupGenderPageInner />
    </Suspense>
  );
}
