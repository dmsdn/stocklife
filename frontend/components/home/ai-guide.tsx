"use client";

import {
  ArrowRight,
  ShoppingCart,
  Sparkles,
  Wallet,
} from "lucide-react";

import { SectionTitle } from "./section-title";

type AiGuideCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  button: string;
  prompt: string;
  onSelectPrompt: (prompt: string) => void;
};

export function AiGuide({
  onSelectPrompt,
}: {
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <section className="w-full pt-7">
      <div className="px-4 sm:px-6 lg:px-8">
        <SectionTitle
          title="AI를 활용해보세요"
        />
      </div>

      <div className="w-full overflow-x-auto scrollbar-hide">
        <div className="flex w-max gap-3 px-4 pb-1 sm:px-6 lg:px-8">
          <AiGuideCard
            icon={<Sparkles size={18} />}
            title={"이번주 장보기를\nAI에게 맡겨보세요"}
            description="필요한 상품부터 예산까지 한 번에 정리해드려요."
            button="장보기 계획 세우기"
            prompt="이번주 장보기 계획을 같이 세워줘"
            onSelectPrompt={onSelectPrompt}
          />

          <AiGuideCard
            icon={<ShoppingCart size={18} />}
            title={"장보기 동선을\nAI가 만들어드려요"}
            description="매장 안에서 가장 효율적인 순서로 안내해요."
            button="동선 만들어보기"
            prompt="매장 안에서 가장 효율적인 동선을 짜줘"
            onSelectPrompt={onSelectPrompt}
          />

          <AiGuideCard
            icon={<Wallet size={18} />}
            title={"이번달 소비를\nAI에게 분석받아보세요"}
            description="내 쇼핑 패턴을 분석하고 절약 방법을 찾아드려요."
            button="소비 분석하기"
            prompt="이번달 내 소비 패턴을 분석해줘"
            onSelectPrompt={onSelectPrompt}
          />
        </div>
      </div>
    </section>
  );
}

function AiGuideCard({
  icon,
  title,
  description,
  button,
  prompt,
  onSelectPrompt,
}: AiGuideCardProps) {
  return (
    <div className="w-[78vw] max-w-[280px] shrink-0 rounded-sm border border-border p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-muted">
        {icon}
      </div>

      <h3 className="mt-4 whitespace-pre-line text-md font-semibold leading-5">
        {title}
      </h3>

      <p className="mt-2 h-10 text-sm leading-4 text-muted-foreground">
        {description}
      </p>

      <button
        type="button"
        onClick={() => onSelectPrompt(prompt)}
        className="mt-4 flex items-center gap-1 text-sm font-medium"
      >
        {button}
        <ArrowRight size={11} />
      </button>
    </div>
  );
}
