"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";
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

  // ✅ 신규 — Frame_115 참고: "만나서 반갑습니다 / {이름}님." 두 줄 인사말에 쓸 이름.
  //   이 시점엔 아직 가입 전이라 서버 프로필이 없고, 이전 단계(전화번호/비밀번호/이름
  //   입력)에서 로컬에 임시로 저장해둔 초안(signup-draft)에서 읽어옵니다.
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(readSignupDraft().name ?? null);
  }, []);

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
     * 필수 동의는 개인정보 수집(personalInfoConsent)뿐입니다.
     * 카메라/마이크는 백엔드에서 선택 동의로 바뀌었는데(2026-08-19),
     * 여기서 예전 기준으로 필수 취급하던 걸 수정.
     */
    if (draft.personalInfoConsent !== true) {
      setError(
        "필수 동의 항목을 확인해주세요."
      );
      return;
    }

    try {
      setSubmitting(true);

      await signup({
        phoneNumber: draft.phoneNumber,
        name: draft.name ?? "",
        password: draft.password,

        gender:
          draft.gender || undefined,

        birthDate:
          draft.birthDate || undefined,

        cameraConsent:
          !!draft.cameraConsent,

        personalInfoConsent:
          draft.personalInfoConsent,

        micConsent:
          !!draft.micConsent,

        marketingConsent:
          !!draft.marketingConsent,
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
    <div className="flex min-h-dvh flex-col pb-[140px] pt-[87px]">
      {/* ✅ 수정(요청) — 참고 이미지(Frame_115)대로: "만나서 반갑습니다 / {이름}님." 두
          줄을 가운데 정렬, 안내문구는 그 아래 바짝(mt-2), "바로 가입하기" 버튼도 안내문구
          바로 아래(mt-4)로 붙임 — 예전엔 이 인사말/이름/설명이 아예 없었고 "바로
          가입하기"도 하단 고정바 안에 "다음"과 같이 끼어 있었음. 이제 "다음"만 하단에
          고정되고, "바로 가입하기"는 본문 흐름 안에 있음. */}
      <h1 className="text-center text-2xl font-bold leading-8">
        만나서 반갑습니다
        <br />
        {name ?? "회원"}님.
      </h1>

      <p className="mt-2 text-center text-xs leading-[18px] text-muted-foreground">
        더 나은 서비스 이용을 위해 추가 정보를 입력해주세요
      </p>

      {/* ✅ 수정(2026-09) — "본인인증"/"확인하고 가입하기"와 같은 형식: radius 8px,
          연한 주황 테두리, 메인 주황 글씨, 흰 배경. */}
      <button
        type="button"
        onClick={handleSkipAll}
        disabled={submitting}
        className="mt-4 flex h-12 w-full items-center justify-center rounded-sm border border-[#ffcbb9] bg-white text-sm text-main transition hover:bg-[#fff0eb] disabled:opacity-50"
      >
        바로 가입하기
      </button>

      {error && (
        <p className="mt-4 text-xs text-danger">
          {error}
        </p>
      )}

      {/* ✅ 수정 — "다음"은 이 흐름의 다른 화면들과 똑같이 하단 고정 원형 알약 버튼
          하나만. 누르면 곧장 추가 정보 입력(생년월일 단계)으로 이동합니다.
          건너뛰기 확인 모달이 떠 있을 땐 숨김(그 모달 전용 "다음" 버튼이 대신 뜸 —
          아래 showSkipDialog 분기 참고) — 안 그러면 하단에 두 버튼이 겹쳐 보임. */}
      {!showSkipDialog && (
        <StickyBottomBar>
          <Button
            type="button"
            onClick={handleStart}
            disabled={submitting}
            className="flex mx-auto h-[60px] w-fit px-5 rounded-full shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
          >
            다음
          </Button>
        </StickyBottomBar>
      )}

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

          {/* ✅ 수정(요청) — "건너뛰기"(모두 건너뛰고 가입)는 그대로 모달 안에 둠. */}
          <DialogFooter>
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

      {/* ✅ 수정(요청) — "계속 입력하기"를 "다음"으로 바꾸고 모달 밖 화면 하단으로 뺌. */}
      {showSkipDialog && (
        <StickyBottomBar>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowSkipDialog(false)}
            className="flex mx-auto h-[60px] w-fit px-5 rounded-full shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
          >
            다음
          </Button>
        </StickyBottomBar>
      )}
    </div>
  );
}