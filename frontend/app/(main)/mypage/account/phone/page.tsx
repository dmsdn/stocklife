"use client";

import { useEffect } from "react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";

// ⚠ 백엔드에 전화번호 변경 API가 없습니다. 화면만 자리잡아두고, API 생기면 연결하면 됩니다.
export default function AccountPhonePage() {
  // ✅ 신규(요청) — 다른 정보 수정 화면들과 마찬가지로 하단 탭바 숨김.
  const { setHidden } = useBottomBarVisibility();
  useEffect(() => {
    setHidden(true);
    return () => setHidden(false);
  }, [setHidden]);

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-2xl md:p-8">
      <SubpageHeader title="계정" />
      <p className="py-10 text-center text-sm text-muted-foreground">
        전화번호 변경 기능은 준비 중이에요.
      </p>
    </div>
  );
}
