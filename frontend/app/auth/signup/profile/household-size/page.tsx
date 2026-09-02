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

type HouseholdSize =
  | 1
  | 2
  | 3
  | 4
  | 5;

export default function SignupHouseholdSizePage() {
  const router = useRouter();

  const [value, setValue] =
    useState<
      HouseholdSize | null | undefined
    >(undefined);

  const nextTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  useEffect(() => {
    setValue(
      readSignupDraft().householdSize
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
        "/auth/signup/profile/pet"
      );
    }, 300);
  };

  const handleSelect = (
    nextValue: HouseholdSize
  ) => {
    setValue(nextValue);

    writeSignupDraft({
      householdSize: nextValue,
    });

    moveNext();
  };

  const handleSkip = () => {
    setValue(null);

    writeSignupDraft({
      householdSize: null,
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
              "/auth/signup/profile/gender"
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
          함께 사는 가족은
          <br />
          몇 명인가요?
        </h1>

        <div className="space-y-2">
          <ChoiceButton
            selected={value === 1}
            onClick={() =>
              handleSelect(1)
            }
          >
            1명
          </ChoiceButton>

          <ChoiceButton
            selected={value === 2}
            onClick={() =>
              handleSelect(2)
            }
          >
            2명
          </ChoiceButton>

          <ChoiceButton
            selected={value === 3}
            onClick={() =>
              handleSelect(3)
            }
          >
            3명
          </ChoiceButton>

          <ChoiceButton
            selected={value === 4}
            onClick={() =>
              handleSelect(4)
            }
          >
            4명
          </ChoiceButton>

          <ChoiceButton
            selected={value === 5}
            onClick={() =>
              handleSelect(5)
            }
          >
            5명 이상
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