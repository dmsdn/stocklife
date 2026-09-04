// components/domain/scroll-to-top-button.tsx
// ✅ 신규 — 검색/리스트/대화 목록처럼 세로로 긴 화면에서 아래로 스크롤하면 화면 하단
//   가운데에 떠오르는 "맨 위로" 버튼. 40x40 원형(하단탭바의 60px 버튼들보다 작게 —
//   요청대로 "60까진 필요없고 40x40"). 여러 화면에서 재사용할 수 있게 공용 컴포넌트로
//   뺐습니다 — 검색/저장 목록/리브 대화 목록/홈 화면 등에 그대로 붙여 쓰면 됩니다.
"use client";

import { useEffect, useState } from "react";
import { RiArrowUpLine, RiArrowLeftSLine } from "@remixicon/react";

export function ScrollToTopButton({
  /** 이 값(px)보다 더 내려가야 버튼이 뜸. 기본 300px. */
  threshold = 300,
}: {
  threshold?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="맨 위로"
      className="fixed bottom-24 left-1/2 z-40 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-[0_4px_16px_rgba(0,0,0,0.15)] transition-opacity"
    >
      <RiArrowUpLine size={20} />
    </button>
  );
}

// ✅ 신규 — 뒤로가기를 화면 좌측 상단에 떠 있는 원형 버튼으로. 스크롤 유무와 무관하게
//   항상 고정(그래서 ScrollToTopButton과 달리 visible 토글이 없음).
export function FloatingBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="뒤로가기"
      className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
    >
      <RiArrowLeftSLine size={22} />
    </button>
  );
}
