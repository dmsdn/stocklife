"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ProfileStep, ProfileChoice } from "@/components/domain/profile-step";
import { readSignupDraft, writeSignupDraft } from "@/lib/signup-draft";

function SignupCarPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editMode = searchParams.get("edit") === "1";

  const [name, setName] = useState<string | null>(null);
  const [value, setValue] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    const draft = readSignupDraft();
    setName(draft.name ?? null);
    setValue(draft.byCar ?? (draft.byCar === null ? null : undefined));
  }, []);

  const handleNext = () => {
    writeSignupDraft({ byCar: value ?? null });
    // ✅ 차량 여부는 원래 마지막 단계였고, 이 뒤에 확인 화면(Frame 122)으로 이어집니다.
    //   수정 모드로 들어왔을 때도 결국 같은 확인 화면으로 돌아가므로 목적지는 동일합니다.
    router.push("/auth/signup/profile/confirm");
  };

  return (
    <ProfileStep
      title="차를 이용해 방문하시나요?"
      description={`정보를 입력해주시면\n${name ?? "회원"} 님을 위해 더 많은 정보를 추천해드릴 수 있어요`}
      onBack={() => router.push("/auth/signup/profile/child")}
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

export default function SignupCarPage() {
  return (
    <Suspense fallback={<div className="min-h-full" />}>
      <SignupCarPageInner />
    </Suspense>
  );
}
