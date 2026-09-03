"use client";

import Link from "next/link";
import { RiAddLine } from "@remixicon/react";
import { useAiPanel } from "@/components/layout/ai-panel-context";

const chips = [
  { href: "/", label: "홈" },
  { href: "/mypage", label: "구매목록" },
];

export function QuickTabChips() {
  const { open: openAiChat } = useAiPanel();
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm"
        >
          {chip.label}
        </Link>
      ))}
      {/* ✅ 수정(2026-09) — "리브 페이지" 삭제로 /ai 링크 대신 모달을 여는 버튼으로 */}
      <button
        type="button"
        onClick={() => openAiChat()}
        className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm"
      >
        AI
      </button>
      <button
        type="button"
        aria-label="새 목록 추가"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border"
      >
        <RiAddLine size={24} />
      </button>
    </div>
  );
}
