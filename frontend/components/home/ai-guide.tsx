// components/home/ai-guide.tsx
// ✅ 홈 리디자인(2026-08, 4차 — 구조 전면 재작업)
//   기존엔 가로로 스크롤하는 넓은 카드(설명 문단 포함) 3장이었는데, 카드 자체의 실루엣이
//   RecommendedProducts·AiDiscovered와 비슷해 다른 섹션들과 구분이 잘 안 됐습니다.
//   실제로 다른 구조로 바꿈: 3열 grid 타일(아이콘+한 줄 라벨만, 세로 스크롤 없이 한 화면에
//   다 보임) — HomeDashboard의 바로가기 그리드와 같은 문법을 써서 "그리드형 섹션"이라는
//   걸 시각적으로 통일시켰습니다.
"use client";

import { RiSparkling2Line, RiShoppingCartLine, RiWallet3Line } from "@remixicon/react";

import { SectionTitle } from "./section-title";

const GUIDE_ITEMS = [
  {
    icon: RiSparkling2Line,
    label: "장보기 계획 세우기",
    prompt: "이번주 장보기 계획을 같이 세워줘",
  },
  {
    icon: RiShoppingCartLine,
    label: "매장 동선 만들기",
    prompt: "매장 안에서 가장 효율적인 동선을 짜줘",
  },
  {
    icon: RiWallet3Line,
    label: "이번달 소비 분석",
    prompt: "이번달 내 소비 패턴을 분석해줘",
  },
];

export function AiGuide({
  onSelectPrompt,
}: {
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <SectionTitle title="AI를 활용해보세요" />

      <div className="grid grid-cols-3 gap-2">
        {GUIDE_ITEMS.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelectPrompt(prompt)}
            className="flex flex-col items-center gap-2 rounded-lg bg-card px-2 py-4 text-center ring-1 ring-foreground/10"
          >
            <Icon size={24} className="shrink-0 text-foreground" />
            <p className="line-clamp-2 text-xs font-medium leading-4">{label}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
