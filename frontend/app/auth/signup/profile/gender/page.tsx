"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  readSignupDraft,
  writeSignupDraft,
} from "@/lib/signup-draft";

type Gender = "MALE" | "FEMALE";

export default function SignupGenderPage() {
  const router = useRouter();

  const [gender, setGender] =
    useState<Gender | null | undefined>(
      undefined
    );

  const nextTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  useEffect(() => {
    const draft = readSignupDraft();

    if (
      draft.gender === "MALE" ||
      draft.gender === "FEMALE"
    ) {
      setGender(draft.gender);
    } else if (draft.gender === null) {
      setGender(null);
    } else {
      setGender(undefined);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (nextTimerRef.current) {
        clearTimeout(nextTimerRef.current);
      }
    };
  }, []);

  const moveNext = () => {
    if (nextTimerRef.current) {
      clearTimeout(nextTimerRef.current);
    }

    nextTimerRef.current = setTimeout(() => {
      router.push(
        "/auth/signup/profile/household-size"
      );
    }, 300);
  };

  const handleSelect = (
    value: Gender
  ) => {
    setGender(value);

    writeSignupDraft({
      gender: value,
    });

    moveNext();
  };

  const handleSkip = () => {
    setGender(null);

    writeSignupDraft({
      gender: null,
    });

    moveNext();
  };

  const handleSkipAll = () => {
    router.push(
      "/auth/signup/profile"
    );
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* 상단 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            router.push(
              "/auth/signup/profile/birth-date"
            )
          }
          className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-muted"
          aria-label="이전"
        >
          <ArrowLeft size={24} />
        </button>

        <button
          type="button"
          onClick={handleSkipAll}
          className="rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted"
        >
          전체 건너뛰기
        </button>
      </div>

      {/* 질문 */}
      <div className="mt-10 space-y-7">
        <h1 className="text-2xl font-semibold leading-snug">
          성별을
          <br />
          알려주세요
        </h1>

        <div className="space-y-2">
          <ChoiceButton
            selected={gender === "MALE"}
            onClick={() =>
              handleSelect("MALE")
            }
          >
            남
          </ChoiceButton>

          <ChoiceButton
            selected={
              gender === "FEMALE"
            }
            onClick={() =>
              handleSelect("FEMALE")
            }
          >
            여
          </ChoiceButton>

          <ChoiceButton
            selected={gender === null}
            onClick={handleSkip}
            subtle
          >
            선택 안함
          </ChoiceButton>
        </div>
      </div>
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
              ? "border-border bg-background text-muted-foreground/45 hover:bg-muted/40"
              : "border-border bg-background text-muted-foreground/65 hover:bg-muted/40"
        }
      `}
    >
      {children}
    </button>
  );
}