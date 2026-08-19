"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { signup } from "@/lib/auth";
import {
  clearSignupDraft,
  clearSignupProfileDraft,
  readSignupDraft,
} from "@/lib/signup-draft";

export default function SignupProfilePage() {
  const router = useRouter();

  const [showSkipDialog, setShowSkipDialog] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  /*
   * 새로운 추가정보 입력을 시작한다.
   *
   * 이전에 입력했던 추가정보는 전부 제거하고
   * 전화번호 / 비밀번호 / 약관 동의만 유지한다.
   */
  const handleStart = () => {
    clearSignupProfileDraft();

    router.push(
      "/auth/signup/profile/birth-date"
    );
  };

  /*
   * 추가정보 전체 건너뛰기.
   */
  const handleSkipAll = () => {
    setShowSkipDialog(true);
  };

  /*
   * 추가정보를 모두 버리고 바로 가입.
   */
  const handleConfirmSkipAll = async () => {
    clearSignupProfileDraft();

    setShowSkipDialog(false);

    await handleSignup();
  };

  /*
   * 최종 회원가입
   */
  const handleSignup = async () => {
    setError(null);

    const draft = readSignupDraft();

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
     * 백엔드 수정 전 임시 조건.
     * 카메라 / 마이크가 선택사항으로 바뀌면
     * 이 부분도 수정한다.
     */
    if (
      draft.personalInfoConsent !== true ||
      draft.cameraConsent !== true ||
      draft.micConsent !== true
    ) {
      setError(
        "필수 동의 항목을 확인해주세요."
      );
      return;
    }

    try {
      setSubmitting(true);

      await signup({
        phoneNumber: draft.phoneNumber,
        password: draft.password,

        gender:
          draft.gender || undefined,

        birthDate:
          draft.birthDate || undefined,

        cameraConsent:
          draft.cameraConsent,

        personalInfoConsent:
          draft.personalInfoConsent,

        micConsent:
          draft.micConsent,
      });

      clearSignupDraft();

      router.push("/auth/login");
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
      <div className="space-y-8">
        <p className="text-2xl font-semibold leading-snug">
          추천을 위한 추가 정보를
          <br />
          입력해주세요
        </p>

        <Button
          type="button"
          onClick={handleStart}
          disabled={submitting}
          className="h-12 w-full rounded-sm"
        >
          추가정보 입력하기
        </Button>

        {error && (
          <p className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="mt-auto pt-10">
        <button
          type="button"
          onClick={handleSkipAll}
          disabled={submitting}
          className="flex h-12 w-full items-center justify-center rounded-sm text-sm text-muted-foreground transition hover:bg-muted disabled:opacity-50"
        >
          추가정보 전체 건너뛰기
        </button>
      </div>

      <Dialog
        open={showSkipDialog}
        onOpenChange={setShowSkipDialog}
      >
        <DialogContent
          showCloseButton
          className="max-w-sm"
        >
          <DialogHeader>
            <DialogTitle>
              추가정보를 모두 건너뛸까요?
            </DialogTitle>

            <DialogDescription>
              추가정보를 입력하지 않고
              회원가입을 진행합니다.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <button
              type="button"
              onClick={() =>
                setShowSkipDialog(false)
              }
              className="rounded-sm border border-border px-4 py-2 text-sm"
            >
              계속 입력하기
            </button>

            <Button
              type="button"
              onClick={handleConfirmSkipAll}
              disabled={submitting}
              className="rounded-sm"
            >
              모두 건너뛰고 가입
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}