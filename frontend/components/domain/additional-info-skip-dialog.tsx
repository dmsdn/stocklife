"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdditionalInfoSkipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  submitting?: boolean;
}

export function AdditionalInfoSkipDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting = false,
}: AdditionalInfoSkipDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
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
            지금까지 선택한 추가정보가 있다면
            모두 저장되지 않습니다.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-[8px]"
            onClick={() =>
              onOpenChange(false)
            }
            disabled={submitting}
          >
            계속 입력하기
          </Button>

          <Button
            type="button"
            className="rounded-[8px]"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting
              ? "처리 중..."
              : "버리고 가입하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}