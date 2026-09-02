// app/auth/signup/terms/page.tsx
// ✅ 참고 디자인(Frame 112) 기준 전면 재작성. 예전엔 카드(bg-card) 안에 2줄 설명+캡션이
//   붙은 항목이었는데, 참고 디자인은 타이틀 아래 여백 있는 리스트, 항목당 한 줄, 회색 사각
//   체크박스, 우측 화살표(있는 항목만) 구조입니다.
//   ⚠ "마케팅 정보 수신 동의"는 참고 이미지에 [필수]로 표기돼 있지만, 마케팅 동의를
//   필수로 강제하면 정보통신망법상 문제 소지가 있어 실제 필수 체크(버튼 활성화 조건)에는
//   포함하지 않았습니다 — 라벨 표기만 이미지와 맞추고, "필수"는 실제로 개인정보 동의만
//   유지합니다. 확인 부탁드립니다.
//   ⚠ 카메라/마이크/마케팅 항목은 lib/legal-content.ts에 본문이 없어 화살표(상세보기)를
//   달지 않았습니다 — 실제 콘텐츠가 있는 "개인정보 수집·이용"만 눌러서 볼 수 있습니다.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TermsModal } from "@/components/domain/terms-modal";
import { writeSignupDraft } from "@/lib/signup-draft";

export default function SignupTermsPage() {
  const router = useRouter();

  const [personalInfoConsent, setPersonalInfoConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [cameraConsent, setCameraConsent] = useState(false);
  const [micConsent, setMicConsent] = useState(false);

  const allAgreed = personalInfoConsent && marketingConsent && cameraConsent && micConsent;
  const requiredMet = personalInfoConsent;

  const toggleAll = (checked: boolean) => {
    setPersonalInfoConsent(checked);
    setMarketingConsent(checked);
    setCameraConsent(checked);
    setMicConsent(checked);
  };

  const handleNext = () => {
    if (!requiredMet) return;

    /*
     * 약관 동의 상태만 임시 저장.
     * 실제 회원가입은 추가정보 입력까지 끝난 뒤 profile/page.tsx에서 최종 호출한다.
     */
    writeSignupDraft({ personalInfoConsent, cameraConsent, micConsent, marketingConsent });
    router.push("/auth/signup");
  };

  const items: {
    key: string;
    label: string;
    checked: boolean;
    onChange: () => void;
    docId: string;
  }[] = [
    {
      key: "personal",
      label: "[필수] 개인정보 수집, 이용 동의",
      checked: personalInfoConsent,
      onChange: () => setPersonalInfoConsent((v) => !v),
      docId: "privacy",
    },
    {
      key: "marketing",
      label: "[선택] 마케팅 정보 수신 동의",
      checked: marketingConsent,
      onChange: () => setMarketingConsent((v) => !v),
      docId: "marketing",
    },
    {
      key: "camera",
      label: "[선택] 카메라 접근 동의",
      checked: cameraConsent,
      onChange: () => setCameraConsent((v) => !v),
      docId: "camera",
    },
    {
      key: "mic",
      label: "[선택] 마이크 접근 동의",
      checked: micConsent,
      onChange: () => setMicConsent((v) => !v),
      docId: "mic",
    },
  ];

  return (
    <div className="flex min-h-full flex-col pt-[85px]">
      <h1 className="text-2xl font-bold leading-8">
        <span className="font-black">STOCK LIFE</span> 서비스 이용약관에
        <br />
        동의해주세요
      </h1>

      <div className="mt-9">
        <label className="flex items-center gap-2.5 text-sm font-medium">
          <Checkbox checked={allAgreed} onChange={() => toggleAll(!allAgreed)} variant="brand" />
          전체 동의
        </label>

        <div className="mt-[13px] space-y-[17px] border-t border-border pt-[13px]">
          {items.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2.5 text-sm">
                <Checkbox checked={item.checked} onChange={item.onChange} variant="brand" />
                <span className="truncate">{item.label}</span>
              </label>
              <TermsModal docId={item.docId} />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto pb-[42px] pt-10">
        <Button className="h-[60px] w-full rounded-full" disabled={!requiredMet} onClick={handleNext}>
          동의하고 가입하기
        </Button>
      </div>
    </div>
  );
}
