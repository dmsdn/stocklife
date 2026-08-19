// app/auth/signup/page.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { toBackendPhone } from "@/lib/auth";
import { writeSignupDraft } from "@/lib/signup-draft";

const PHONE_LENGTH = 11;

const underlineInput =
  "rounded-none border-0 border-b-2 border-border bg-transparent px-0 focus-visible:border-foreground disabled:opacity-50";

type Stage = "phone" | "code" | "password";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 7),
    digits.slice(7, 11),
  ].filter(Boolean);

  return parts.join(" - ");
}

export default function SignupPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const [code, setCode] = useState("");

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [stage, setStage] = useState<Stage>("phone");

  /*
   * 전화번호
   */
  const phoneValid =
    toBackendPhone(phone).length === PHONE_LENGTH;

  /*
   * 인증번호
   */
  const codeValid = /^\d{6}$/.test(code);

  /*
   * 비밀번호
   *
   * - 8~20자
   * - 영문 1자 이상
   * - 특수문자 1자 이상
   */
  const passwordValid =
    /^(?=.*[A-Za-z])(?=.*[^A-Za-z0-9]).{8,20}$/.test(
      password
    );

  /*
   * 비밀번호 확인
   */
  const passwordMatches =
    passwordConfirm.length > 0 &&
    passwordConfirm === password;

  /*
   * 비밀번호 단계에서 다음 버튼을 활성화할 수 있는지
   */
  const passwordStepValid =
    passwordValid && passwordMatches;

  /*
   * 전화번호 입력
   */
  const handlePhoneChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setPhone(formatPhone(e.target.value));
  };

  /*
   * 인증번호 요청
   *
   * TODO:
   * 백엔드 SMS API 연결
   *
   * POST /api/consumers/phone/send-code
   */
  const handleSendCode = () => {
    if (!phoneValid) return;

    setCodeSent(true);
    setCode("");
    setStage("code");
  };

  /*
   * 하단 다음 버튼
   */
  const handleBottomButton = () => {
    /*
     * -----------------------------------------
     * 인증번호 단계
     * -----------------------------------------
     */
    if (stage === "code") {
      if (!codeValid) return;

      /*
       * TODO:
       * 백엔드 인증번호 검증 API 연결
       *
       * POST /api/consumers/phone/verify-code
       *
       * 실제 인증 성공 후에만
       * password 단계로 이동해야 함.
       */

      setStage("password");
      return;
    }

    /*
     * -----------------------------------------
     * 비밀번호 단계
     * -----------------------------------------
     */
    if (stage === "password") {
      if (!passwordStepValid) return;

      /*
       * 전화번호 + 비밀번호 임시 저장
       */
      writeSignupDraft({
        phoneNumber: toBackendPhone(phone),
        password,
      });

      /*
       * 추가정보 페이지로 이동
       *
       * 추가정보는 선택사항이므로
       * 여기서 입력하지 않아도 다음 단계로 갈 수 있음.
       */
      router.push("/auth/signup/profile");
    }
  };

  /*
   * 현재 단계에 따른 버튼 활성화
   */
  const bottomButtonDisabled =
    (stage === "code" && !codeValid) ||
    (stage === "password" && !passwordStepValid);

  return (
    <div className="space-y-8">
      <p className="text-2xl font-semibold leading-snug">
        회원가입을 위해
        <br />
        정보를 입력해주세요
      </p>

      <div className="space-y-4">

        {/* =====================================================
            전화번호
        ====================================================== */}

        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="tel"
            name="phone"
            placeholder="010 - 0000 - 0000"
            value={phone}
            onChange={handlePhoneChange}
            disabled={codeSent}
            className={`flex-1 ${underlineInput}`}
          />

          <Button
            type="button"
            variant="outline"
            disabled={!phoneValid || codeSent}
            onClick={handleSendCode}
          >
            인증번호
          </Button>
        </div>

        {/* =====================================================
            인증번호
        ====================================================== */}

        {codeSent && (
          <div className="space-y-1">
            <Input
              inputMode="numeric"
              placeholder="인증번호를 입력해주세요"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 6)
                )
              }
              readOnly={stage !== "code"}
              className={underlineInput}
            />

            {stage === "code" && (
              <p className="text-xs text-muted-foreground">
                인증번호를 발송했어요
              </p>
            )}
          </div>
        )}

        {/* =====================================================
            비밀번호
            인증번호 확인 후 두 입력창을 한 번에 보여줌
        ====================================================== */}

        {stage === "password" && (
          <div className="space-y-5">

            {/* 비밀번호 */}

            <div className="space-y-1">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="비밀번호를 입력해주세요"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                className={underlineInput}
              />

              {password.length > 0 &&
                !passwordValid && (
                  <p className="text-xs text-danger">
                    영문과 특수문자를 포함해
                    8~20자로 입력해주세요
                  </p>
                )}

              {password.length > 0 &&
                passwordValid && (
                  <p className="text-xs text-muted-foreground">
                    사용 가능한 비밀번호예요
                  </p>
                )}
            </div>

            {/* 비밀번호 재입력 */}

            <div className="space-y-1">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="비밀번호를 한 번 더 입력해주세요"
                value={passwordConfirm}
                onChange={(e) =>
                  setPasswordConfirm(e.target.value)
                }
                className={underlineInput}
              />

              {passwordConfirm.length > 0 &&
                !passwordMatches && (
                  <p className="text-xs text-danger">
                    비밀번호가 일치하지 않아요
                  </p>
                )}

              {passwordMatches && (
                <p className="text-xs text-muted-foreground">
                  비밀번호가 일치해요
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================
          다음 버튼
      ====================================================== */}

      {stage !== "phone" && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={bottomButtonDisabled}
          onClick={handleBottomButton}
        >
          다음
        </Button>
      )}
    </div>
  );
}