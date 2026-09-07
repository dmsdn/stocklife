// app/(main)/mypage/permissions/page.tsx
// ⚠ 브라우저 정책상 JS로 이미 허용된 권한을 "끄는" 건 불가능합니다(사용자가 브라우저
//   설정에서 직접 해야 함) — 여기선 현재 상태 확인 + 아직 안 물어봤으면 다시 요청만 가능합니다.
// ✅ 수정(2026-09) — 요청: 브라우저 카메라·마이크 권한뿐 아니라, 가입할 때 동의한 약관
//   항목들(개인정보 수집·이용/마케팅 수신/카메라·마이크 접근 동의)도 여기서 확인할 수
//   있게 추가. GET /api/consumers/me가 내려주는 marketingConsent/cameraConsent/micConsent
//   값을 그대로 보여주고, 개인정보 수집·이용은 가입 자체의 필수 조건이라 항상 "동의완료".
"use client";

import { useEffect, useState } from "react";
import {
  RiCameraLine,
  RiMicLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiQuestionLine,
  RiShieldCheckLine,
  RiMegaphoneLine,
} from "@remixicon/react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { Button } from "@/components/ui/button";
import { TermsModal } from "@/components/domain/terms-modal";
import { usePermissionStatus, type PermissionState } from "@/lib/use-permission-status";
import { PermissionRequestDialog } from "@/components/domain/permission-request-dialog";
import { getMyProfile, type ConsumerMe } from "@/lib/consumer-api";

const STATE_LABEL: Record<PermissionState, string> = {
  granted: "허용됨",
  denied: "거부됨",
  prompt: "아직 요청 안 함",
  unsupported: "확인 불가",
};

function StateIcon({ state }: { state: PermissionState }) {
  if (state === "granted") return <RiCheckboxCircleLine size={24} className="text-success" />;
  if (state === "denied") return <RiCloseCircleLine size={24} className="text-danger" />;
  return <RiQuestionLine size={24} className="text-muted-foreground" />;
}

export default function PermissionsPage() {
  const cameraPermission = usePermissionStatus("camera");
  const micPermission = usePermissionStatus("microphone");
  const [modalKind, setModalKind] = useState<"camera" | "microphone" | null>(null);
  const [profile, setProfile] = useState<ConsumerMe | null>(null);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  const requestPermission = (kind: "camera" | "microphone") => {
    if (kind === "camera") {
      navigator.mediaDevices?.getUserMedia({ video: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
    } else {
      navigator.mediaDevices?.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
    }
    setModalKind(null);
  };

  const rows: { kind: "camera" | "microphone"; label: string; icon: typeof RiCameraLine; state: PermissionState }[] = [
    { kind: "camera", label: "카메라", icon: RiCameraLine, state: cameraPermission },
    { kind: "microphone", label: "마이크", icon: RiMicLine, state: micPermission },
  ];

  const consentRows: { docId: string; label: string; icon: typeof RiShieldCheckLine; agreed: boolean }[] = [
    { docId: "privacy", label: "개인정보 수집, 이용 동의", icon: RiShieldCheckLine, agreed: true },
    { docId: "marketing", label: "마케팅 정보 수신 동의", icon: RiMegaphoneLine, agreed: !!profile?.marketingConsent },
    { docId: "camera", label: "카메라 접근 동의", icon: RiCameraLine, agreed: !!profile?.cameraConsent },
    { docId: "mic", label: "마이크 접근 동의", icon: RiMicLine, agreed: !!profile?.micConsent },
  ];

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="권한 설정" />

      <p className="mb-2 text-xs font-medium text-muted-foreground">기기 권한</p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.kind} className="flex items-center gap-3 rounded-sm border border-border p-4">
            <row.icon size={24} className="shrink-0 text-muted-foreground" />
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

      {/* ✅ 신규(요청) — 가입할 때 동의한 약관 항목 확인 */}
      <p className="mb-2 mt-8 text-xs font-medium text-muted-foreground">가입 시 동의한 약관</p>
      <div className="divide-y divide-border rounded-sm border border-border">
        {consentRows.map((row) => (
          <div key={row.docId} className="flex items-center gap-3 px-4 py-3.5">
            <row.icon size={20} className="shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{row.label}</p>
            </div>
            <span className={`flex items-center gap-1 text-xs ${row.agreed ? "text-success" : "text-muted-foreground"}`}>
              {row.agreed ? <RiCheckboxCircleLine size={18} /> : <RiCloseCircleLine size={18} />}
              {row.agreed ? "동의함" : "동의 안 함"}
            </span>
            <TermsModal docId={row.docId} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        마케팅·카메라·마이크 동의는 선택 항목이라 회원정보에서 값을 바꿔도 서비스 이용에는
        제한이 없어요. 변경은 각 기능을 처음 쓸 때 다시 물어봅니다.
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
