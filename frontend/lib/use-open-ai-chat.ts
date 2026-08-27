"use client";

import { useRouter } from "next/navigation";
import { useAiPanel } from "@/components/layout/ai-panel-context";
import { useMediaQuery } from "./use-media-query";

/**
 * ✅ AI챗을 여는 방법이 두 갈래(헤더의 전역 패널 vs 홈 화면 카드들의 자체 Dialog)로 나뉘어
 *   있던 게 "모바일→웹, 웹→모바일 전환 시 AI챗이 왼쪽에 중복으로 뜨고 홈이 안 보이는" 버그의
 *   원인이었습니다. 이제 어디서 열든 이 훅 하나만 씁니다.
 *   - 데스크톱: 전역 패널(AiPanelContext)만 열림 — 페이지 이동 없음
 *   - 모바일: 전역 패널 state에 프롬프트만 담아두고 `/ai` 라우트로 이동
 */
export function useOpenAiChat() {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { open } = useAiPanel();

  return (prompt?: string, groupId?: number) => {
    open(prompt, groupId);
    if (!isDesktop) {
      router.push("/ai");
    }
  };
}
