// app/(main)/mypage/account/gender/page.tsx
// ✅ 회원가입 화면과 완전히 똑같게 — ProfileStep + ProfileChoice 재사용(요청: "회원가입할
//   때 화면과 똑같이"). 한 번 입력하면 수정 불가 — 이미 값 있으면 안내만 보여주고 선택
//   UI 자체를 숨깁니다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiArrowLeftSLine } from "@remixicon/react";
import { ProfileStep, ProfileChoice } from "@/components/domain/profile-step";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";
import { getMyProfile, updateMyProfile } from "@/lib/consumer-api";

const OPTIONS = [
  { value: "MALE", label: "남성" },
  { value: "FEMALE", label: "여성" },
];

export default function AccountGenderPage() {
  const router = useRouter();
  const [gender, setGender] = useState<string | null>(null);
  const [alreadySet, setAlreadySet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✅ 신규(요청) — "이미 입력해서 수정 불가" 화면은 ProfileStep을 안 거치고 바로
  //   리턴돼서 그쪽의 하단바 숨김이 안 걸렸음. 이 페이지 자체에서도 한 번 더 숨김.
  const { setHidden } = useBottomBarVisibility();
  useEffect(() => {
    setHidden(true);
    return () => setHidden(false);
  }, [setHidden]);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        if (p.gender) setAlreadySet(true);
        setGender(p.gender);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!gender) return;
    setSaving(true);
    try {
      await updateMyProfile({ gender });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="px-6 py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>;
  }

  if (alreadySet) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">성별은 한 번 입력하면 수정할 수 없어요.</p>
        <button type="button" onClick={() => router.back()} className="mt-4 mx-auto flex items-center justify-center gap-1 text-sm">
          <RiArrowLeftSLine size={24} />
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <ProfileStep
      title="성별을 알려주세요"
      onBack={() => router.back()}
      nextDisabled={!gender || saving}
      nextLabel={saving ? "저장 중..." : "저장"}
      onNext={handleSave}
    >
      {OPTIONS.map((opt) => (
        <ProfileChoice key={opt.value} selected={gender === opt.value} onClick={() => setGender(opt.value)}>
          {opt.label}
        </ProfileChoice>
      ))}
    </ProfileStep>
  );
}
