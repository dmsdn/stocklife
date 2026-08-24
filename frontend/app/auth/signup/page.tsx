// app/auth/signup/page.tsx
// ✅ 인증번호 발송/확인을 실제 API(POST /api/consumers/signup/send-code, .../verify-code)로 연결.
// ✅ 비밀번호 규칙이 백엔드에서 "영문+숫자+특수문자" 3종 포함으로 바뀌어서 정규식도 맞춤.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { toBackendPhone, sendSignupCode, verifySignupCode } from "@/lib/auth";
import { writeSignupDraft } from "@/lib/signup-draft";

const PHONE_LENGTH = 11;

const underlineInput =
  "rounded-none border-0 border-b-2 border-border bg-transparent px-0 focus-visible:border-foreground disabled:opacity-50";

type Stage = "phone" | "code" | "password";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  const parts = [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11)].filter(Boolean);
  return parts.join(" - ");
}

export default function SignupPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [sendCodeError, setSendCodeError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [stage, setStage] = useState<Stage>("phone");

  const phoneValid = toBackendPhone(phone).length === PHONE_LENGTH;
  const codeValid = /^\d{6}$/.test(code);

  // 백엔드 규칙(2026-08-19 변경): 영문 1자 이상 + 숫자 1자 이상 + 특수문자 1자 이상, 8~20자
  const passwordValid = /^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,20}$/.test(password);
  const passwordMatches = passwordConfirm.length > 0 && passwordConfirm === password;
  const passwordStepValid = passwordValid && passwordMatches;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleSendCode = async () => {
    if (!phoneValid) return;
    setSendCodeError(null);
    setSendingCode(true);
    try {
      await sendSignupCode(toBackendPhone(phone));
      setCodeSent(true);
      setCode("");
      setStage("code");
    } catch {
      setSendCodeError("인증번호 발송에 실패했어요. 전화번호를 확인해주세요.");
    } finally {
      setSendingCode(false);
    }
  };

  const handleBottomButton = async () => {
    if (stage === "code") {
      if (!codeValid) return;
      setVerifyError(null);
      setVerifying(true);
      try {
        await verifySignupCode(toBackendPhone(phone), code);
        setStage("password");
      } catch {
        setVerifyError("인증번호가 올바르지 않거나 만료됐어요.");
      } finally {
        setVerifying(false);
      }
      return;
    }

    if (stage === "password") {
      if (!passwordStepValid) return;
      writeSignupDraft({ phoneNumber: toBackendPhone(phone), password });
      router.push("/auth/signup/profile");
    }
  };

  const bottomButtonDisabled =
    (stage === "code" && (!codeValid || verifying)) ||
    (stage === "password" && !passwordStepValid);

  return (
    <div className="space-y-8">
      <p className="text-2xl font-semibold leading-snug">
        회원가입을 위해
        <br />
        정보를 입력해주세요
      </p>

      <div className="space-y-4">
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
            disabled={!phoneValid || codeSent || sendingCode}
            onClick={handleSendCode}
          >
            {sendingCode ? "발송 중..." : "인증번호"}
          </Button>
        </div>
        {sendCodeError && <p className="text-xs text-danger">{sendCodeError}</p>}

        {codeSent && (
          <div className="space-y-1">
            <Input
              inputMode="numeric"
              placeholder="인증번호를 입력해주세요"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              readOnly={stage !== "code"}
              className={underlineInput}
            />
            {stage === "code" && !verifyError && (
              <p className="text-xs text-muted-foreground">인증번호를 발송했어요</p>
            )}
            {verifyError && <p className="text-xs text-danger">{verifyError}</p>}
          </div>
        )}

        {stage === "password" && (
          <div className="space-y-5">
            <div className="space-y-1">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="비밀번호를 입력해주세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={underlineInput}
              />
              {password.length > 0 && !passwordValid && (
                <p className="text-xs text-danger">영문, 숫자, 특수문자를 모두 포함해 8~20자로 입력해주세요</p>
              )}
              {password.length > 0 && passwordValid && (
                <p className="text-xs text-muted-foreground">사용 가능한 비밀번호예요</p>
              )}
            </div>

            <div className="space-y-1">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="비밀번호를 한 번 더 입력해주세요"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className={underlineInput}
              />
              {passwordConfirm.length > 0 && !passwordMatches && (
                <p className="text-xs text-danger">비밀번호가 일치하지 않아요</p>
              )}
              {passwordMatches && <p className="text-xs text-muted-foreground">비밀번호가 일치해요</p>}
            </div>
          </div>
        )}
      </div>

      {stage !== "phone" && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={bottomButtonDisabled}
          onClick={handleBottomButton}
        >
          {verifying ? "확인 중..." : "다음"}
        </Button>
      )}
    </div>
  );
}
