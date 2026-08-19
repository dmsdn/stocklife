// app/auth/reset-password/new-password/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const underlineInput =
  "rounded-none border-0 border-b-2 border-border bg-transparent px-0 focus-visible:border-foreground";

export default function ResetPasswordNewPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);

  const canSubmit = newPassword.length > 0 && newPassword === newPasswordConfirm;

  const handleSubmit = () => {
    // TODO: 비밀번호 재설정 API 연동
    setCompleteOpen(true);
  };

  return (
    <div className="space-y-8">
      <p className="text-2xl font-semibold leading-snug">
        새로운 비밀번호를
        <br />
        입력해주세요
      </p>

      <div className="space-y-3">
        <Input
          type="password"
          autoComplete="new-password"
          placeholder="새 비밀번호를 입력해주세요"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={underlineInput}
        />
        <Input
          type="password"
          autoComplete="new-password"
          placeholder="새 비밀번호를 한 번 더 입력해주세요"
          value={newPasswordConfirm}
          onChange={(e) => setNewPasswordConfirm(e.target.value)}
          className={underlineInput}
        />
      </div>

      <Button className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
        비밀번호 재설정
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