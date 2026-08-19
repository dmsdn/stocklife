// app/auth/signup/terms/page.tsx
// ⚠ 백엔드가 필수로 요구하는 동의는 cameraConsent / personalInfoConsent / micConsent
//   3개뿐입니다 (전부 true여야 가입 성공). 기존에 만든 5개 약관 체크박스(service/privacy/
//   marketing/outsourcing/minor) 중 실제로 서버에 전달되는 건 privacy(personalInfoConsent)
//   하나뿐이고, 나머지(service/marketing/outsourcing/minor)는 서버에 저장되지 않습니다
//   — 프론트에서만 "동의 UI"로 존재하는 상태입니다. 반대로 카메라/마이크 동의는 기존
//   화면에 아예 없어서 이번에 새로 추가했습니다.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/domain/checkbox";
import { TermsModal } from "@/components/domain/terms-modal";
import { legalDocs, signupTermsOrder } from "@/lib/legal-content";
import { signup } from "@/lib/auth";
import { readSignupDraft, clearSignupDraft } from "@/lib/signup-draft";

const REQUIRED_LEGAL_IDS = ["service", "privacy"];

export default function SignupTermsPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [cameraConsent, setCameraConsent] = useState(false);
  const [micConsent, setMicConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAgreed = signupTermsOrder.every((id) => agreed[id]) && cameraConsent && micConsent;
  const requiredMet = REQUIRED_LEGAL_IDS.every(
    (id) => agreed[id]
  );

  const toggleAll = (checked: boolean) => {
    setAgreed(Object.fromEntries(signupTermsOrder.map((id) => [id, checked])));
    setCameraConsent(checked);
    setMicConsent(checked);
  };

  const toggleOne = (id: string) => {
    setAgreed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const draft = readSignupDraft();
      if (!draft.phoneNumber || !draft.password) {
        // 이전 단계를 안 거치고 바로 이 화면에 온 경우
        setError("이전 단계부터 다시 진행해주세요.");
        setSubmitting(false);
        return;
      }

      await signup({
        phoneNumber: draft.phoneNumber,
        password: draft.password,
        gender: draft.gender,
        // birthDate 미전송 — 상단 주석 및 profile 단계 주석 참고
        cameraConsent,
        personalInfoConsent: !!agreed["privacy"],
        micConsent,
      });

      clearSignupDraft();
      router.push("/auth/login");
    } catch (e) {
      setError("회원가입에 실패했습니다. 입력하신 정보를 확인해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="space-y-4 rounded-b-3xl bg-card p-6">
        <label className="flex items-center gap-2 text-base font-medium">
          <Checkbox checked={allAgreed} onChange={() => toggleAll(!allAgreed)} />
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
                    [{required ? "필수" : "선택"}] {legalDocs[id].title}
                  </span>
                </div>
              
                <TermsModal docId={id} />
              </div>
            );
          })}

          {/* 카메라/마이크는 약관이 아니라 기기 권한 동의라 별도 항목으로 분리 */}
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
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button className="w-full" disabled={!requiredMet || submitting} onClick={handleSubmit}>
          {submitting ? "가입 처리 중..." : "동의"}
        </Button>
      </div>
    </div>
  );
}
