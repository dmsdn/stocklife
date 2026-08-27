"use client";

import { useEffect, useState } from "react";

export type PermissionState = "granted" | "denied" | "prompt" | "unsupported";

/**
 * ✅ Permissions API로 현재 카메라/마이크 권한 상태를 읽습니다.
 * ⚠ 브라우저는 JS가 권한을 직접 켜고 끄는 걸 허용하지 않습니다 — "허용됨"을 다시
 *   "거부"로 되돌리는 건 사용자가 브라우저 설정에서 직접 해야 합니다. 여기서 할 수
 *   있는 건 현재 상태 확인과, 아직 안 물어봤다면(prompt) 다시 요청하는 것뿐입니다.
 */
export function usePermissionStatus(name: "camera" | "microphone") {
  const [state, setState] = useState<PermissionState>("prompt");

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const handleChange = () => status && setState(status.state as PermissionState);

    if (!navigator.permissions?.query) {
      setState("unsupported");
      return;
    }

    navigator.permissions
      .query({ name: name as PermissionName })
      .then((s) => {
        status = s;
        setState(s.state as PermissionState);
        s.addEventListener("change", handleChange);
      })
      .catch(() => setState("unsupported"));

    return () => status?.removeEventListener("change", handleChange);
  }, [name]);

  return state;
}
