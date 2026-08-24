// app/(main)/mypage/permissions/page.tsx
// ⚠ 브라우저 정책상 JS로 이미 허용된 권한을 "끄는" 건 불가능합니다(사용자가 브라우저
//   설정에서 직접 해야 함) — 여기선 현재 상태 확인 + 아직 안 물어봤으면 다시 요청만 가능합니다.
"use client";

import { useState } from "react";
import { Camera, Mic, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Button } from "@/components/ui/button";
import { usePermissionStatus, type PermissionState } from "@/lib/use-permission-status";
import { PermissionRequestDialog } from "@/components/domain/permission-request-dialog";

const STATE_LABEL: Record<PermissionState, string> = {
  granted: "허용됨",
  denied: "거부됨",
  prompt: "아직 요청 안 함",
  unsupported: "확인 불가",
};

function StateIcon({ state }: { state: PermissionState }) {
  if (state === "granted") return <CheckCircle2 size={18} className="text-success" />;
  if (state === "denied") return <XCircle size={18} className="text-danger" />;
  return <HelpCircle size={18} className="text-muted-foreground" />;
}

export default function PermissionsPage() {
  const cameraPermission = usePermissionStatus("camera");
  const micPermission = usePermissionStatus("microphone");
  const [modalKind, setModalKind] = useState<"camera" | "microphone" | null>(null);

  const requestPermission = (kind: "camera" | "microphone") => {
    if (kind === "camera") {
      navigator.mediaDevices?.getUserMedia({ video: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
    } else {
      navigator.mediaDevices?.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
    }
    setModalKind(null);
  };

  const rows: { kind: "camera" | "microphone"; label: string; icon: typeof Camera; state: PermissionState }[] = [
    { kind: "camera", label: "카메라", icon: Camera, state: cameraPermission },
    { kind: "microphone", label: "마이크", icon: Mic, state: micPermission },
  ];

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="권한 설정" />

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.kind} className="flex items-center gap-3 rounded-sm border border-border p-4">
            <row.icon size={20} className="shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{row.label}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <StateIcon state={row.state} />
                {STATE_LABEL[row.state]}
              </p>
            </div>

            {row.state === "prompt" && (
              <Button variant="outline" onClick={() => setModalKind(row.kind)}>
                권한 요청
              </Button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        "거부됨" 상태는 앱에서 다시 요청할 수 없어요. 브라우저 설정 → 사이트 권한에서 직접
        허용으로 바꿔주셔야 해요 (크롬: 주소창 왼쪽 자물쇠 아이콘 → 사이트 설정).
      </p>

      {modalKind && (
        <PermissionRequestDialog
          open={!!modalKind}
          kind={modalKind}
          onConfirm={() => requestPermission(modalKind)}
          onClose={() => setModalKind(null)}
        />
      )}
    </div>
  );
}
