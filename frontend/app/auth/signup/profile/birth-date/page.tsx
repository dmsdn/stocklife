"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ProfileStep, ProfileChoice } from "@/components/domain/profile-step";
import { BirthDatePicker } from "@/components/domain/birth-date-picker";
import { readSignupDraft, writeSignupDraft } from "@/lib/signup-draft";

function SignupBirthDatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editMode = searchParams.get("edit") === "1";

  const [name, setName] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState<string | null | undefined>(undefined);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    const draft = readSignupDraft();
    setName(draft.name ?? null);
    setBirthDate(draft.birthDate ?? (draft.birthDate === null ? null : undefined));
    setSkipped(draft.birthDate === null);
  }, []);

  const handleNext = () => {
    writeSignupDraft({ birthDate: birthDate ?? null });
    router.push(editMode ? "/auth/signup/profile/confirm" : "/auth/signup/profile/gender");
  };

  return (
    <ProfileStep
      title="생년월일을 입력주세요"
      description={`정보를 입력해주시면\n${name ?? "회원"} 님을 위해 더 많은 정보를 추천해드릴 수 있어요`}
      onBack={() => router.push(editMode ? "/auth/signup/profile/confirm" : "/auth/signup")}
      nextDisabled={birthDate === undefined && !skipped}
      nextLabel={editMode ? "수정 완료" : "다음"}
      onNext={handleNext}
    >
      <BirthDatePicker
        value={birthDate ?? ""}
        onChange={(value) => {
          setBirthDate(value);
          setSkipped(false);
        }}
      />
      <ProfileChoice
        selected={skipped}
        onClick={() => {
          setBirthDate(null);
          setSkipped(true);
        }}
      >
        건너뛰기
      </ProfileChoice>
    </ProfileStep>
  );
}

export default function SignupBirthDatePage() {
  return (
    <Suspense fallback={<div className="min-h-full" />}>
      <SignupBirthDatePageInner />
    </Suspense>
  );
}
