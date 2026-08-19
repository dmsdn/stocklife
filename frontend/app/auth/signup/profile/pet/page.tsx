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

export default function SignupPetPage() {
  const router = useRouter();

  const [value, setValue] =
    useState<
      boolean | null | undefined
    >(undefined);

  const nextTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  useEffect(() => {
    setValue(
      readSignupDraft().hasPet
    );
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
        "/auth/signup/profile/child"
      );
    }, 300);
  };

  const handleSelect = (
    nextValue: boolean
  ) => {
    setValue(nextValue);

    writeSignupDraft({
      hasPet: nextValue,
    });

    moveNext();
  };

  const handleSkip = () => {
    setValue(null);

    writeSignupDraft({
      hasPet: null,
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
              "/auth/signup/profile/household-size"
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
          className="rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted"
        >
          전체 건너뛰기
        </button>
      </div>

      {/* 질문 */}
      <div className="mt-10 space-y-7">
        <h1 className="text-2xl font-semibold leading-snug">
          반려동물을
          <br />
          키우시나요?
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