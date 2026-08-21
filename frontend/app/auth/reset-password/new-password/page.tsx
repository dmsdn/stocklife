// app/auth/reset-password/new-password/page.tsx
// ✅ POST /api/consumers/password/reset 실제 연결.
// ⚠ 백엔드 ResetPasswordRequest는 영문+특수문자(숫자는 필수 아님) 8~20자 — 회원가입
//   비밀번호 규칙(영문+숫자+특수문자)과 조건이 다릅니다. 실제 정책과 맞춘 겁니다.
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resetPassword } from "@/lib/auth";

const underlineInput =
  "rounded-none border-0 border-b-2 border-border bg-transparent px-0 focus-visible:border-foreground";

function ResetPasswordNewPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordValid = /^(?=.*[A-Za-z])(?=.*[^A-Za-z0-9]).{8,20}$/.test(newPassword);
  const canSubmit = passwordValid && newPassword === newPasswordConfirm;

  const handleSubmit = async () => {
    if (!phone) {
      setError("인증 단계부터 다시 진행해주세요.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(phone, newPassword);
      setCompleteOpen(true);
    } catch {
      setError("비밀번호 재설정에 실패했어요. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <p className="text-2xl font-semibold leading-snug">
        새로운 비밀번호를
        <br />
        입력해주세요
      </p>

      <div className="space-y-3">
        <div className="space-y-1">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="새 비밀번호를 입력해주세요"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className={underlineInput}
          />
          {newPassword.length > 0 && !passwordValid && (
            <p className="text-xs text-danger">영문과 특수문자를 포함해 8~20자로 입력해주세요</p>
          )}
        </div>
        <Input
          type="password"
          autoComplete="new-password"
          placeholder="새 비밀번호를 한 번 더 입력해주세요"
          value={newPasswordConfirm}
          onChange={(e) => setNewPasswordConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className={underlineInput}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <Button className="w-full" disabled={!canSubmit || submitting} onClick={handleSubmit}>
        {submitting ? "변경 중..." : "비밀번호 재설정"}
      </Button>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비밀번호가 재설정됐어요</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">새 비밀번호로 다시 로그인해주세요.</p>
          <Button className="w-full" onClick={() => router.push("/auth/login")}>
            로그인하러 가기
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ResetPasswordNewPasswordPage() {
  return (
    <Suspense fallback={<div className="space-y-8" />}>
      <ResetPasswordNewPasswordInner />
    </Suspense>
  );
}
