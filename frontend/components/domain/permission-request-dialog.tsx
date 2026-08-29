"use client";

import { Camera, Mic } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PermissionRequestDialogProps {
  open: boolean;
  kind: "camera" | "microphone";
  onConfirm: () => void;
  onClose: () => void;
}

const COPY = {
  camera: { icon: Camera, title: "카메라 접근이 필요해요", desc: "바코드 스캔·사진 촬영 기능을 쓰려면 카메라 권한이 필요합니다." },
  microphone: { icon: Mic, title: "마이크 접근이 필요해요", desc: "음성으로 AI에게 물어보려면 마이크 권한이 필요합니다." },
};

// ✅ 브라우저 기본 권한 팝업이 뜨기 전에 먼저 보여주는 설명 모달입니다.
//   이미 허용된 상태면 호출부에서 아예 이 모달을 안 띄우고 바로 진행하면 됩니다.
export function PermissionRequestDialog({ open, kind, onConfirm, onClose }: PermissionRequestDialogProps) {
  const { icon: Icon, title, desc } = COPY[kind];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon size={24} />
            {title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{desc}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            나중에
          </Button>
          <Button onClick={onConfirm}>허용하기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
