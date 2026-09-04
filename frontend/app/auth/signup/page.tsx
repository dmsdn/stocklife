// app/auth/signup/page.tsx
// ✅ 인증번호 발송/확인을 실제 API(POST /api/consumers/signup/send-code, .../verify-code)로 연결.
// ✅ 비밀번호 규칙이 백엔드에서 "영문+숫자+특수문자" 3종 포함으로 바뀌어서 정규식도 맞춤.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";

import { toBackendPhone, sendSignupCode, verifySignupCode, checkRegistrationStatus } from "@/lib/auth";
import { writeSignupDraft } from "@/lib/signup-draft";
import { ApiError } from "@/lib/api-client";

const PHONE_LENGTH = 11;

const underlineInput =
  "rounded-none border-0 border-b-2 border-border bg-transparent px-0 focus-visible:border-brand disabled:opacity-50";

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
  const [name, setName] = useState("");

  const [stage, setStage] = useState<Stage>("phone");

  const phoneValid = toBackendPhone(phone).length === PHONE_LENGTH;
  const codeValid = /^\d{6}$/.test(code);

  // 백엔드 규칙(2026-08-19 변경): 영문 1자 이상 + 숫자 1자 이상 + 특수문자 1자 이상, 8~20자
  const passwordValid = /^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,20}$/.test(password);
  const passwordMatches = passwordConfirm.length > 0 && passwordConfirm === password;
  const passwordStepValid = passwordValid && passwordMatches && name.trim().length > 0;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleSendCode = async () => {
    if (!phoneValid) return;
    setSendCodeError(null);
    setSendingCode(true);
    try {
      // ✅ 이미 가입된 번호면 인증번호를 보내지 않고 여기서 막습니다.
      const { registered } = await checkRegistrationStatus(toBackendPhone(phone));
      if (registered) {
        setSendCodeError("이미 가입된 번호예요. 로그인해주세요.");
        return;
      }
      await sendSignupCode(toBackendPhone(phone));
      setCodeSent(true);
      setCode("");
      setStage("code");
    } catch (e) {
      // ✅ 수정(2026-09) — 무조건 "전화번호를 확인해주세요"만 보여주고 있었음. 실제로는
      //   전화번호가 문제가 아니라 SMS 발송 자체(외부 문자 API 키/설정, 요금제, 서버가
      //   그 서비스에 못 나가는 네트워크 환경 등)가 원인인 경우가 많은데, 그러면 이
      //   문구는 오히려 원인을 잘못 짚게 만듭니다. apiFetch가 실제 백엔드 에러 메시지를
      //   읽어오면 그걸 그대로 보여줌.
      setSendCodeError(e instanceof ApiError ? e.message : "인증번호 발송에 실패했어요. 전화번호를 확인해주세요.");
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
      writeSignupDraft({ phoneNumber: toBackendPhone(phone), password, name: name.trim() });
      router.push("/auth/signup/profile");
    }
  };

  const bottomButtonDisabled =
    (stage === "code" && (!codeValid || verifying)) ||
    (stage === "password" && !passwordStepValid);

  return (
    <div className="flex min-h-dvh flex-col pb-[140px] pt-[87px]">
      <h1 className="text-2xl font-bold leading-8">
        본인인증 및 로그인을 위한
        <br />
        전화번호를 입력해주세요
      </h1>

      <div className="mt-[43px] space-y-[17px]">
        <div className="flex items-end gap-2">
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="tel"
            name="phone"
            placeholder="010 - 0000 - 0000"
            value={phone}
            onChange={handlePhoneChange}
            onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
            disabled={codeSent}
            className={`h-10 flex-1 py-0 text-sm ${underlineInput}`}
          />
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-sm border-brand text-brand text-sm hover:bg-brand/5 hover:text-brand disabled:border-border disabled:text-muted-foreground"
            disabled={!phoneValid || codeSent || sendingCode}
            onClick={handleSendCode}
          >
            {sendingCode ? "발송 중..." : stage === "password" ? "인증완료" : "본인인증"}
          </Button>
        </div>
        {sendCodeError && <p className="text-xs text-danger">{sendCodeError}</p>}

        {/* ✅ 인증 완료 후(비밀번호/이름 입력 단계)에는 인증번호 입력칸을 숨김 */}
        {codeSent && stage === "code" && (
          <div className="space-y-1">
            <Input
              inputMode="numeric"
              placeholder="인증번호 6자리를 입력하세요"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && handleBottomButton()}
              readOnly={stage !== "code"}
              className={`h-10 py-0 text-sm ${underlineInput}`}
            />
            {stage === "code" && !verifyError && (
              <p className="text-xs text-muted-foreground">인증번호를 발송했어요</p>
            )}
            {verifyError && <p className="text-xs text-danger">{verifyError}</p>}
          </div>
        )}

        {stage === "password" && (
          <div className="space-y-[17px]">
            <div className="space-y-1">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="비밀번호 입력 (영문 + 숫자 + 특수문자, 9자)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBottomButton()}
                className={`h-10 py-0 text-sm ${underlineInput}`}
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
                placeholder="비밀번호 재입력"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBottomButton()}
                className={`h-10 py-0 text-sm ${underlineInput}`}
              />
              {passwordConfirm.length > 0 && !passwordMatches && (
                <p className="text-xs text-danger">비밀번호가 일치하지 않아요</p>
              )}
              {passwordMatches && <p className="text-xs text-muted-foreground">비밀번호가 일치해요</p>}
            </div>

            <div className="space-y-1">
              <Input
                autoComplete="name"
                placeholder="이름을 입력해주세요"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBottomButton()}
                className={`h-10 py-0 text-sm ${underlineInput}`}
                maxLength={50}
              />
            </div>
          </div>
        )}
      </div>

      {stage !== "phone" && (
        <StickyBottomBar>
          <Button
            type="button"
            variant="secondary"
            className="flex mx-auto h-[60px] w-fit px-5 rounded-full shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
            disabled={bottomButtonDisabled}
            onClick={handleBottomButton}
          >
            {verifying ? "확인 중..." : "다음"}
          </Button>
        </StickyBottomBar>
      )}
    </div>
  );
}
