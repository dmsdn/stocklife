// app/auth/signup/profile/confirm/page.tsx
// ✅ 신규 — 참고 디자인(Frame 122)에 있던 화면인데 기존 코드엔 없었습니다(모든 단계를
//   끝내면 바로 회원가입이 실행됐음). 그리고 기존 SignupSummaryDialog는 있었지만
//   "수정하기"가 무조건 첫 단계(생년월일)로 돌려보내는 방식이라 요청하신 "각 항목을
//   선택하면 그 항목만 수정" 기능이 없었습니다.
//   이 페이지가 그 두 가지를 모두 해결합니다:
//   - 추가정보 각 행(생년월일/성별/가구원 수/반려동물/자녀/방문 방법)을 누르면 해당 단계
//     페이지로 ?edit=1과 함께 이동합니다.
//   - 그 단계 페이지는 edit=1일 때 버튼이 "수정 완료"로 바뀌고, 눌렀을 때 다음 단계가
//     아니라 이 확인 화면으로 곧장 돌아옵니다.
//   전화번호/비밀번호/이름은 참고 이미지에도 화살표가 없어(수정 진입점 없음) 그대로
//   표시만 합니다.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiArrowRightSLine } from "@remixicon/react";

import { Button } from "@/components/ui/button";
import { signup } from "@/lib/auth";
import { clearSignupDraft, readSignupDraft, type SignupDraft } from "@/lib/signup-draft";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatBirthDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

export default function SignupConfirmPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<SignupDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(readSignupDraft());
  }, []);

  const handleConfirm = async () => {
    setError(null);
    const current = readSignupDraft();

    if (!current.phoneNumber) {
      setError("전화번호 입력부터 다시 진행해주세요.");
      return;
    }
    if (!current.password) {
      setError("비밀번호 입력부터 다시 진행해주세요.");
      return;
    }
    if (current.personalInfoConsent !== true) {
      setError("필수 동의 항목을 확인해주세요.");
      return;
    }

    try {
      setSubmitting(true);
      await signup({
        phoneNumber: current.phoneNumber,
        name: current.name ?? "",
        password: current.password,
        gender: current.gender || undefined,
        birthDate: current.birthDate || undefined,
        cameraConsent: !!current.cameraConsent,
        personalInfoConsent: current.personalInfoConsent,
        micConsent: !!current.micConsent,
        marketingConsent: !!current.marketingConsent,
        householdSize: current.householdSize ?? undefined,
        hasPet: current.hasPet ?? undefined,
        hasChild: current.hasChild ?? undefined,
        byCar: current.byCar ?? undefined,
      });

      clearSignupDraft();
      router.push("/auth/login");
    } catch (e) {
      console.error("회원가입 실패:", e);
      setError("회원가입에 실패했습니다. 입력하신 정보를 확인해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!draft) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim md:static md:z-auto md:bg-transparent md:pt-10">
      <div className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-background p-5 pb-[42px] md:max-h-none md:rounded-sm md:border md:border-border">
        <h1 className="text-lg font-bold leading-7">입력한 정보를 확인해주세요</h1>
        <p className="mt-1 text-xs text-muted-foreground">선택하지 않은 항목은 저장되지 않아요.</p>

        <section className="mt-6">
          <p className="mb-2 text-xs font-medium text-muted-foreground">회원정보</p>
          <div className="overflow-hidden rounded-sm border border-border">
            <Row label="전화번호" value={draft.phoneNumber ? formatPhone(draft.phoneNumber) : "없음"} />
            <Row label="비밀번호" value={draft.password ? "설정됨" : "없음"} />
            <Row label="이름" value={draft.name || "없음"} last />
          </div>
        </section>

        <section className="mt-6">
          <p className="mb-2 text-xs font-medium text-muted-foreground">추가정보</p>
          <div className="overflow-hidden rounded-sm border border-border">
            <Row
              label="생년월일"
              value={draft.birthDate ? formatBirthDate(draft.birthDate) : "선택 안함"}
              onClick={() => router.push("/auth/signup/profile/birth-date?edit=1")}
            />
            <Row
              label="성별"
              value={draft.gender === "MALE" ? "남성" : draft.gender === "FEMALE" ? "여성" : "선택 안함"}
              onClick={() => router.push("/auth/signup/profile/gender?edit=1")}
            />
            <Row
              label="가구원 수"
              value={
                draft.householdSize == null
                  ? "선택 안함"
                  : draft.householdSize === 5
                    ? "5인 이상"
                    : `${draft.householdSize}인`
              }
              onClick={() => router.push("/auth/signup/profile/household-size?edit=1")}
            />
            <Row
              label="반려동물"
              value={draft.hasPet == null ? "선택 안함" : draft.hasPet ? "예" : "아니오"}
              onClick={() => router.push("/auth/signup/profile/pet?edit=1")}
            />
            <Row
              label="자녀"
              value={draft.hasChild == null ? "선택 안함" : draft.hasChild ? "예" : "아니오"}
              onClick={() => router.push("/auth/signup/profile/child?edit=1")}
            />
            <Row
              label="방문 방법"
              value={draft.byCar == null ? "선택 안함" : draft.byCar ? "차량" : "도보·대중교통"}
              onClick={() => router.push("/auth/signup/profile/car?edit=1")}
              last
            />
          </div>
        </section>

        {error && <p className="mt-4 text-xs text-danger">{error}</p>}

        <Button className="mt-6 flex mx-auto h-[60px] w-fit px-5 rounded-full" disabled={submitting} onClick={handleConfirm}>
          {submitting ? "가입 처리 중..." : "확인하고 가입하기"}
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  onClick,
  last = false,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  last?: boolean;
}) {
  const content = (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1 text-sm font-medium ${value === "선택 안함" ? "text-muted-foreground/45" : ""}`}>
        {value}
        {onClick && <RiArrowRightSLine size={16} className="text-muted-foreground" />}
      </span>
    </>
  );

  const className = `flex items-center justify-between px-4 py-3.5 ${!last ? "border-b border-border" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`w-full text-left ${className}`}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
