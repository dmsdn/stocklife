// app/(main)/mypage/account/age/page.tsx
// ✅ 회원가입 때 쓰는 생년월일 입력 화면(BirthDatePicker)과 동일한 UI로 교체.
// ✅ 한 번 입력하고 나면 다시 이 화면에 못 들어오게 — 내 정보 화면에서 이미 값이 있으면
//   이 페이지로 가는 링크 자체를 없앴습니다(아래 account/page.tsx 참고). 그래도 직접
//   주소로 들어올 경우를 대비해 여기서도 한 번 더 막습니다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiArrowLeftSLine } from "@remixicon/react";
import { SubpageHeader } from "@/components/domain/subpage-header";
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

  const handleChange = async (value: string) => {
    setBirthDate(value);
    setSaving(true);
    try {
      await updateMyProfile({ birthDate: value });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="생년월일" />

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : alreadySet ? (
        <div className="py-10 text-center">
          <p className="text-sm text-muted-foreground">생년월일은 한 번 입력하면 수정할 수 없어요.</p>
          <button type="button" onClick={() => router.back()} className="mt-4 flex items-center justify-center gap-1 text-sm mx-auto">
            <RiArrowLeftSLine size={24} />
            돌아가기
          </button>
        </div>
      ) : (
        <div className="mt-10 space-y-2">
          {/* ✅ mode="inline" — 버튼 한 번 더 안 누르고 페이지 들어오자마자 휠이 바로 보임 */}
          <BirthDatePicker mode="inline" value={birthDate} onChange={handleChange} />
          {saving && <p className="text-center text-xs text-muted-foreground">저장 중...</p>}
        </div>
      )}
    </div>
  );
}
