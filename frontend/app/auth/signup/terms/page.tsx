"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TermsModal } from "@/components/domain/terms-modal";
import { legalDocs, signupTermsOrder } from "@/lib/legal-content";
import { writeSignupDraft } from "@/lib/signup-draft";

const REQUIRED_LEGAL_IDS = ["service", "privacy"];

export default function SignupTermsPage() {
  const router = useRouter();

  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [cameraConsent, setCameraConsent] = useState(false);
  const [micConsent, setMicConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  const allAgreed =
    signupTermsOrder.every((id) => agreed[id]) &&
    cameraConsent &&
    micConsent &&
    marketingConsent;

  const requiredMet = REQUIRED_LEGAL_IDS.every(
    (id) => agreed[id]
  );

  const toggleAll = (checked: boolean) => {
    setAgreed(
      Object.fromEntries(
        signupTermsOrder.map((id) => [id, checked])
      )
    );

    setCameraConsent(checked);
    setMicConsent(checked);
    setMarketingConsent(checked);
  };

  const toggleOne = (id: string) => {
    setAgreed((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleNext = () => {
    if (!requiredMet) return;

    /*
     * 약관 동의 상태만 임시 저장.
     *
     * 여기서 signup API를 호출하면 안 됨.
     * 실제 회원가입은 추가정보 입력까지 끝난 뒤
     * profile/page.tsx에서 최종적으로 호출한다.
     */
    writeSignupDraft({
      personalInfoConsent: !!agreed["privacy"],
      cameraConsent,
      micConsent,
      marketingConsent,
    });

    router.push("/auth/signup");
  };

  return (
    <div>
      <div className="space-y-4 rounded-b-md bg-card p-6">
        {/* 전체 동의 */}
        <label className="flex items-center gap-2 text-base font-medium">
          <Checkbox
            checked={allAgreed}
            onChange={() => toggleAll(!allAgreed)}
          />
          약관 모두 동의
        </label>

        <div className="space-y-3 border-t border-border pt-3">
          {signupTermsOrder.map((id) => {
            const required = REQUIRED_LEGAL_IDS.includes(id);

            return (
              <div
                key={id}
                className="flex items-center justify-between text-sm text-muted-foreground"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={!!agreed[id]}
                    onChange={() => toggleOne(id)}
                  />

                  <span>
                    [{required ? "필수" : "선택"}]{" "}
                    {legalDocs[id].title}
                  </span>
                </div>

                <TermsModal docId={id} />
              </div>
            );
          })}

          {/* 카메라 */}
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={cameraConsent}
              onChange={() =>
                setCameraConsent((v) => !v)
              }
            />

            <span>
              [선택] 카메라 접근 동의
              <br />
              <span className="text-xs text-muted-foreground/70">
                상품 사진 검색 및 상품 스캔에 사용
              </span>
            </span>
          </div>

          {/* 마이크 */}
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={micConsent}
              onChange={() =>
                setMicConsent((v) => !v)
              }
            />

            <span>
              [선택] 마이크 접근 동의
              <br />
              <span className="text-xs text-muted-foreground/70">
                음성 질의 기능에 사용
              </span>
            </span>
          </div>
          {/* 마케팅 */}
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={marketingConsent}
              onChange={() =>
                setMarketingConsent((v) => !v)
              }
            />

            <span>
              [선택] 마케팅 정보 수신 동의
              <br />
              <span className="text-xs text-muted-foreground/70">
                할인/이벤트 알림 등에 사용
              </span>
            </span>
          </div>
        </div>

        <Button
          className="w-full"
          disabled={!requiredMet}
          onClick={handleNext}
        >
          동의하고 계속하기
        </Button>
      </div>
    </div>
  );
}