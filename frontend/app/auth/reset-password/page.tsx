// app/auth/reset-password/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

  const handleSendCode = () => {
    // TODO: 인증번호 발송 API 연동
    setCodeSent(true);
  };

  const handleSubmit = () => {
    // TODO: 인증번호 확인 API 연동
    router.push("/auth/reset-password/new-password");
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
            className={`flex-1 ${underlineInput}`}
          />
          <Button type="button" variant="secondary" className="shrink-0" onClick={handleSendCode}>
            인증번호
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
      </div>

      <Button className="w-full" disabled={code.length !== 6} onClick={handleSubmit}>
        확인
      </Button>
    </div>
  );
}