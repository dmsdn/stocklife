// components/domain/login-required-dialog.tsx
"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LoginRequiredDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LoginRequiredDialog({ open, onClose }: LoginRequiredDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>로그인이 필요해요</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          이 기능은 로그인 후에 이용할 수 있어요.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
          <Button
            onClick={() => {
              onClose();
              // TODO: 지금은 마이페이지로 이동 — /auth/login으로 바로 보내려면 이 경로만 바꾸면 됨
              router.push("/mypage");
            }}
          >
            로그인하고 이용하기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}