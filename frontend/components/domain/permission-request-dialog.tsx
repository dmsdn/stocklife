"use client";

import { RiCameraLine, RiMicLine } from "@remixicon/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SplitBottomBar } from "@/components/domain/split-bottom-bar";

interface PermissionRequestDialogProps {
  open: boolean;
  kind: "camera" | "microphone";
  onConfirm: () => void;
  onClose: () => void;
}

const COPY = {
  camera: { icon: RiCameraLine, title: "카메라 접근이 필요해요", desc: "바코드 스캔·사진 촬영 기능을 쓰려면 카메라 권한이 필요합니다." },
  microphone: { icon: RiMicLine, title: "마이크 접근이 필요해요", desc: "음성으로 AI에게 물어보려면 마이크 권한이 필요합니다." },
};

// ✅ 브라우저 기본 권한 팝업이 뜨기 전에 먼저 보여주는 설명 모달입니다.
//   이미 허용된 상태면 호출부에서 아예 이 모달을 안 띄우고 바로 진행하면 됩니다.
// ✅ 수정(요청) — 확인 버튼을 모달 밖 화면 하단으로, "취소 | 허용하기" 하나의 알약
//   안에서 나뉘는 형태로(SplitBottomBar).
export function PermissionRequestDialog({ open, kind, onConfirm, onClose }: PermissionRequestDialogProps) {
  const { icon: Icon, title, desc } = COPY[kind];

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon size={24} />
              {title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </DialogContent>
      </Dialog>

      {open && (
        <SplitBottomBar
          leftLabel="취소"
          onLeft={onClose}
          leftTone="muted"
          rightLabel="허용하기"
          onRight={onConfirm}
          rightTone="main"
        />
      )}
    </>
  );
}
