// components/domain/split-bottom-bar.tsx
// ✅ 신규 — "탈퇴하기 | 취소"처럼, 확인 모달의 두 버튼을 모달 안이 아니라 화면 하단에
//   고정하고, 두 개로 나뉜 별도 버튼이 아니라 하나의 알약(h-60) 안에서 세로선으로
//   나뉜 두 구역으로 보여주는 공용 컴포넌트. StickyBottomBar와 같은 위치 고정 방식을
//   쓰되, 안에 들어가는 게 버튼 하나가 아니라 이 "분할 알약"이라는 점만 다름.
"use client";

import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";

interface SplitBottomBarProps {
  leftLabel: string;
  onLeft: () => void;
  leftDisabled?: boolean;
  /** 기본은 회색(취소/보조) 느낌. 필요하면 "danger"로. */
  leftTone?: "muted" | "danger" | "main";
  rightLabel: string;
  onRight: () => void;
  rightDisabled?: boolean;
  rightTone?: "muted" | "danger" | "main";
  /** 다른 StickyBottomBar 위에 중첩될 때 z-index를 올림(StickyBottomBar의 elevated와 동일). */
  elevated?: boolean;
}

const toneClass: Record<NonNullable<SplitBottomBarProps["leftTone"]>, string> = {
  muted: "text-muted-foreground",
  danger: "text-danger",
  main: "text-main",
};

export function SplitBottomBar({
  leftLabel,
  onLeft,
  leftDisabled,
  leftTone = "muted",
  rightLabel,
  onRight,
  rightDisabled,
  rightTone = "main",
  elevated = false,
}: SplitBottomBarProps) {
  return (
    <StickyBottomBar elevated={elevated}>
      <div className="mx-auto flex h-[60px] w-fit divide-x divide-border overflow-hidden rounded-full border border-border bg-white shadow-[0_-2px_20px_rgba(0,0,0,0.1)]">
        <button
          type="button"
          onClick={onLeft}
          disabled={leftDisabled}
          className={`flex h-full items-center justify-center px-6 text-sm font-medium disabled:opacity-50 ${toneClass[leftTone]}`}
        >
          {leftLabel}
        </button>
        <button
          type="button"
          onClick={onRight}
          disabled={rightDisabled}
          className={`flex h-full items-center justify-center px-6 text-sm font-medium disabled:opacity-50 ${toneClass[rightTone]}`}
        >
          {rightLabel}
        </button>
      </div>
    </StickyBottomBar>
  );
}
