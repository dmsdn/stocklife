// app/(main)/mypage/account/age/page.tsx
// ✅ 회원가입 때 쓰는 생년월일 입력 화면과 완전히 똑같게 — 아예 같은 컴포넌트(ProfileStep)를
//   재사용합니다(요청: "회원가입할 때 화면과 똑같이"). 이러면 헤더/여백/버튼(h-60, 좌우
//   텍스트 폭 맞춤 원형 알약)이 자동으로 항상 같이 맞습니다.
// ✅ 한 번 입력하고 나면 다시 이 화면에 못 들어오게 — 내 정보 화면에서 이미 값이 있으면
//   이 페이지로 가는 링크 자체를 없앴습니다(아래 account/page.tsx 참고). 그래도 직접
//   주소로 들어올 경우를 대비해 여기서도 한 번 더 막습니다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiArrowLeftSLine } from "@remixicon/react";
import { ProfileStep } from "@/components/domain/profile-step";
import { BirthDatePicker } from "@/components/domain/birth-date-picker";
import { getMyProfile, updateMyProfile } from "@/lib/consumer-api";

export default function AccountAgePage() {
  const router = useRouter();
  const [birthDate, setBirthDate] = useState("");
  const [alreadySet, setAlreadySet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        if (p.birthDate) setAlreadySet(true);
        setBirthDate(p.birthDate ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!birthDate) return;
    setSaving(true);
    try {
      await updateMyProfile({ birthDate });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>;
  }

  if (alreadySet) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">생년월일은 한 번 입력하면 수정할 수 없어요.</p>
        <button type="button" onClick={() => router.back()} className="mt-4 flex items-center justify-center gap-1 text-sm mx-auto">
          <RiArrowLeftSLine size={24} />
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <ProfileStep
      title="생년월일을 입력해주세요"
      onBack={() => router.back()}
      nextDisabled={!birthDate || saving}
      nextLabel={saving ? "저장 중..." : "저장"}
      onNext={handleSave}
    >
      <BirthDatePicker value={birthDate} onChange={setBirthDate} />
    </ProfileStep>
  );
}
