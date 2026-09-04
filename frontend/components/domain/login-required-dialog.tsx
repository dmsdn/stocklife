// components/domain/login-required-dialog.tsx
// ✅ 수정(요청) — 확인 버튼을 모달 밖 화면 하단으로, "취소 | 로그인 시도" 하나의 알약
//   안에서 나뉘는 형태로(SplitBottomBar).
"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SplitBottomBar } from "@/components/domain/split-bottom-bar";

interface LoginRequiredDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LoginRequiredDialog({ open, onClose }: LoginRequiredDialogProps) {
  const router = useRouter();

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>로그인이 필요해요</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            이 기능은 로그인 후에 이용할 수 있어요.
          </p>
        </DialogContent>
      </Dialog>

      {open && (
        <SplitBottomBar
          leftLabel="취소"
          onLeft={onClose}
          leftTone="muted"
          rightLabel="로그인 시도"
          onRight={() => {
            onClose();
            router.push("/auth/login?next=/cart");
          }}
          rightTone="main"
        />
      )}
    </>
  );
}
