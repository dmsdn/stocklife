"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

import { SignupSummaryDialog } from "@/components/domain/signup-summary-dialog";

import { signup } from "@/lib/auth";

import {
  readSignupDraft,
  writeSignupDraft,
  clearSignupDraft,
} from "@/lib/signup-draft";

export default function SignupCarPage() {
  const router = useRouter();

  const [value, setValue] =
    useState<
      boolean | null | undefined
    >(undefined);

  const [summaryOpen, setSummaryOpen] =
    useState(false);

  const [summaryDraft, setSummaryDraft] =
    useState(
      readSignupDraft()
    );

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const timerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  useEffect(() => {
    setValue(
      readSignupDraft().byCar
    );
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  /*
   * 차량 선택 후 300ms 뒤
   * 전체 요약 모달 표시
   */
  const showSummary = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setSummaryDraft(
        readSignupDraft()
      );

      setSummaryOpen(true);
    }, 300);
  };

  const handleSelect = (
    nextValue: boolean
  ) => {
    setValue(nextValue);

    writeSignupDraft({
      byCar: nextValue,
    });

    showSummary();
  };

  const handleSkip = () => {
    setValue(null);

    writeSignupDraft({
      byCar: null,
    });

    showSummary();
  };

  /*
   * 추가정보 전체 건너뛰기
   */
  const handleSkipAll = () => {
    router.push(
      "/auth/signup/profile"
    );
  };

  /*
   * 요약 내용 수정
   */
  const handleEdit = () => {
    setSummaryOpen(false);

    router.push(
      "/auth/signup/profile/birth-date"
    );
  };

  /*
   * 최종 회원가입
   */
  const handleConfirm = async () => {
    setError(null);

    const draft =
      readSignupDraft();

    if (!draft.phoneNumber) {
      setError(
        "전화번호 입력부터 다시 진행해주세요."
      );
      return;
    }

    if (!draft.password) {
      setError(
        "비밀번호 입력부터 다시 진행해주세요."
      );
      return;
    }

    /*
     * 필수 동의는 개인정보 수집(personalInfoConsent)뿐입니다.
     * 카메라/마이크/마케팅은 백엔드에서 선택 동의로 바뀌었는데(2026-08-19),
     * 여기서 예전 기준으로 카메라·마이크까지 필수로 막고 있던 걸 수정.
     */
    if (draft.personalInfoConsent !== true) {
      setError(
        "필수 동의 항목을 확인해주세요."
      );
      return;
    }

    try {
      setSubmitting(true);

      /*
       * 백엔드 스키마 v2.5 기준 전체 필드 전송.
       * (householdSize/hasPet/hasChild/byCar가 예전엔 백엔드에 없어서 빠져있었는데,
       *  지금은 백엔드가 다 받고 있어서 같이 보냄)
       */
      await signup({
        phoneNumber:
          draft.phoneNumber,

        name:
          draft.name ?? "",

        password:
          draft.password,

        gender:
          draft.gender ||
          undefined,

        birthDate:
          draft.birthDate ||
          undefined,

        cameraConsent:
          !!draft.cameraConsent,

        personalInfoConsent:
          draft.personalInfoConsent,

        micConsent:
          !!draft.micConsent,

        marketingConsent:
          !!draft.marketingConsent,

        householdSize:
          draft.householdSize ??
          undefined,

        hasPet:
          draft.hasPet ??
          undefined,

        hasChild:
          draft.hasChild ??
          undefined,

        byCar:
          draft.byCar ??
          undefined,
      });

      clearSignupDraft();

      setSummaryOpen(false);

      router.push(
        "/auth/login"
      );
    } catch (e) {
      console.error(
        "회원가입 실패:",
        e
      );

      setError(
        "회원가입에 실패했습니다. 입력하신 정보를 확인해주세요."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* 상단 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            router.push(
              "/auth/signup/profile/child"
            )
          }
          className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-muted"
          aria-label="이전"
        >
          <ArrowLeft size={18} />
        </button>

        <button
          type="button"
          onClick={handleSkipAll}
          disabled={submitting}
          className="rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          전체 건너뛰기
        </button>
      </div>

      {/* 질문 */}
      <div className="mt-10 space-y-7">
        <h1 className="text-2xl font-semibold leading-snug">
          주로 차를 가지고
          <br />
          오시나요?
        </h1>

        <div className="space-y-2">
          <ChoiceButton
            selected={value === true}
            onClick={() =>
              handleSelect(true)
            }
          >
            예
          </ChoiceButton>

          <ChoiceButton
            selected={value === false}
            onClick={() =>
              handleSelect(false)
            }
          >
            아니오
          </ChoiceButton>

          <ChoiceButton
            selected={value === null}
            onClick={handleSkip}
            subtle
          >
            선택 안함
          </ChoiceButton>
        </div>

        {error && (
          <p className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <SignupSummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        draft={summaryDraft}
        onEdit={handleEdit}
        onConfirm={handleConfirm}
        submitting={submitting}
      />
    </div>
  );
}

function ChoiceButton({
  children,
  selected,
  onClick,
  subtle = false,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  subtle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex h-12 w-full
        items-center justify-start
        rounded-sm
        border
        px-4
        text-left
        text-sm font-medium
        transition
        ${
          selected
            ? "border-foreground bg-foreground text-background"
            : subtle
              ? "border-border bg-background text-muted-foreground/45"
              : "border-border bg-background text-muted-foreground/65 hover:bg-muted/40"
        }
      `}
    >
      {children}
    </button>
  );
}