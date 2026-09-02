"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ProfileStep, ProfileChoice } from "@/components/domain/profile-step";
import { readSignupDraft, writeSignupDraft } from "@/lib/signup-draft";

function SignupChildPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editMode = searchParams.get("edit") === "1";

  const [name, setName] = useState<string | null>(null);
  const [value, setValue] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    const draft = readSignupDraft();
    setName(draft.name ?? null);
    setValue(draft.hasChild ?? (draft.hasChild === null ? null : undefined));
  }, []);

  const handleNext = () => {
    writeSignupDraft({ hasChild: value ?? null });
    router.push(editMode ? "/auth/signup/profile/confirm" : "/auth/signup/profile/car");
  };

  return (
    <ProfileStep
      title="어린 자녀가 있으신가요?"
      description={`정보를 입력해주시면\n${name ?? "회원"} 님을 위해 더 많은 정보를 추천해드릴 수 있어요`}
      onBack={() => router.push("/auth/signup/profile/pet")}
      nextDisabled={value === undefined}
      nextLabel={editMode ? "수정 완료" : "다음"}
      onNext={handleNext}
    >
      <ProfileChoice selected={value === true} onClick={() => setValue(true)}>
        예
      </ProfileChoice>
      <ProfileChoice selected={value === false} onClick={() => setValue(false)}>
        아니오
      </ProfileChoice>
      <ProfileChoice selected={value === null} onClick={() => setValue(null)}>
        건너뛰기
      </ProfileChoice>
    </ProfileStep>
  );
}

export default function SignupChildPage() {
  return (
    <Suspense fallback={<div className="min-h-full" />}>
      <SignupChildPageInner />
    </Suspense>
  );
}
