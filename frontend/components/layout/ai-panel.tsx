// components/layout/ai-panel.tsx
// ✅ position:fixed 패널 — 더 이상 main과 같은 flex row에서 높이를 "공유"하지 않는다.
//   왼쪽 컨텐츠가 얼마나 길든, 문서 스크롤이 얼마나 내려가든 이 패널은 뷰포트 기준
//   top-16(헤더 아래) ~ bottom-0 에 고정되고, 내부는 AiChatBody가 자체 스크롤한다.
//   대신 패널이 열려 있을 때 본문이 패널 밑에 깔리지 않도록 AppShell에서 main에 오른쪽
//   여백(md:mr-[420px])을 별도로 준다.
"use client";

import { useEffect } from "react";
import { RiCloseLine } from "@remixicon/react";
import { useRouter, usePathname } from "next/navigation";
import { useAiPanel } from "./ai-panel-context";
import { AiChatBody } from "@/components/ai/ai-chat-body";
import { useMediaQuery } from "@/lib/use-media-query";

export function AiPanel() {
  const { isOpen, initialMessage, close } = useAiPanel();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // ✅ 웹에서 AI 패널을 켜놓은 채로 창을 모바일 폭까지 줄이면(또는 모바일 기기로 전환하면)
    //   패널은 md:flex라 화면에서 사라지는데 페이지는 그대로 홈이라 "AI챗이 꺼진 것"처럼
    //   보이던 문제. 모바일 폭이 되는 순간 같은 대화(initialMessage 포함)를 들고
    //   /ai 전체화면으로 자연스럽게 넘겨준다.
    if (!isDesktop && isOpen && pathname !== "/ai") {
      router.push("/ai");
    }
  }, [isDesktop, isOpen, pathname, router]);

  if (!isOpen) return null;

  return (
    <aside className="fixed right-0 top-16 bottom-0 z-[90] hidden w-[420px] flex-col overflow-hidden border-l border-border bg-background md:flex">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <span className="text-lg font-semibold">AI에게 물어보기</span>
        <button type="button" onClick={close} aria-label="AI 패널 닫기">
          <RiCloseLine size={24} />
        </button>
      </div>
      <AiChatBody initialMessage={initialMessage} />
    </aside>
  );
}
