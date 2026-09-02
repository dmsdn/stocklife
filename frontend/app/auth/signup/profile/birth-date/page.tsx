"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BirthDatePicker } from "@/components/domain/birth-date-picker";

import {
  readSignupDraft,
  writeSignupDraft,
} from "@/lib/signup-draft";

export default function SignupBirthDatePage() {
  const router = useRouter();

  const [birthDate, setBirthDate] =
    useState<
      string | null | undefined
    >(undefined);

  const nextTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  useEffect(() => {
    setBirthDate(
      readSignupDraft().birthDate
    );
  }, []);

  useEffect(() => {
    return () => {
      if (nextTimerRef.current) {
        clearTimeout(
          nextTimerRef.current
        );
      }
    };
  }, []);

  const moveNext = () => {
    if (nextTimerRef.current) {
      clearTimeout(
        nextTimerRef.current
      );
    }

    nextTimerRef.current = setTimeout(() => {
      router.push(
        "/auth/signup/profile/gender"
      );
    }, 300);
  };

  const handleBirthDateChange = (
    value: string
  ) => {
    setBirthDate(value);

    writeSignupDraft({
      birthDate: value,
    });

    moveNext();
  };

  const handleSkip = () => {
    setBirthDate(null);

    writeSignupDraft({
      birthDate: null,
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
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            router.push(
              "/auth/signup/profile"
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

      <div className="mt-10 space-y-7">
        <h1 className="text-2xl font-semibold leading-snug">
          생년월일을
          <br />
          알려주세요
        </h1>

        <div className="space-y-2">
          <BirthDatePicker
            value={birthDate ?? ""}
            onChange={handleBirthDateChange}
          />

          <button
            type="button"
            onClick={handleSkip}
            className={`
              flex h-12 w-full
              items-center justify-start
              rounded-sm
              border
              px-4
              text-left
              text-sm
              transition
              ${
                birthDate === null
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground/55 hover:bg-muted/40"
              }
            `}
          >
            선택 안함
          </button>
        </div>
      </div>
    </div>
  );
}