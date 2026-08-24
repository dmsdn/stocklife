// app/auth/reset-password/page.tsx
// ✅ 인증번호 발송/확인을 실제 API로 연결. 전화번호는 다음 단계(new-password)로
//   쿼리 파라미터로 넘깁니다.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendPasswordResetCode, verifyPasswordResetCode, toBackendPhone } from "@/lib/auth";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  const parts = [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11)].filter(Boolean);
  return parts.join(" - ");
}

const underlineInput =
  "rounded-none border-0 border-b-2 border-border bg-transparent px-0 focus-visible:border-foreground";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    setError(null);
    setSending(true);
    try {
      await sendPasswordResetCode(toBackendPhone(phone));
      setCodeSent(true);
    } catch {
      setError("인증번호 발송에 실패했어요. 가입된 전화번호인지 확인해주세요.");
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setVerifying(true);
    try {
      await verifyPasswordResetCode(toBackendPhone(phone), code);
      router.push(`/auth/reset-password/new-password?phone=${toBackendPhone(phone)}`);
    } catch {
      setError("인증번호가 올바르지 않거나 만료됐어요.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-8">
      <p className="text-2xl font-semibold leading-snug">
        가입하신 전화번호를
        <br />
        입력해주세요
      </p>

      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="010 - 0000 - 0000"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            disabled={codeSent}
            className={`flex-1 ${underlineInput}`}
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            disabled={sending || codeSent}
            onClick={handleSendCode}
          >
            {sending ? "발송 중..." : "인증번호"}
          </Button>
        </div>

        {codeSent && (
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d*"
            placeholder="인증번호를 입력하세요"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className={underlineInput}
          />
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <Button className="w-full" disabled={code.length !== 6 || verifying} onClick={handleSubmit}>
        {verifying ? "확인 중..." : "확인"}
      </Button>
    </div>
  );
}
