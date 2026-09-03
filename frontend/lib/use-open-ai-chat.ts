"use client";

import { useAiPanel } from "@/components/layout/ai-panel-context";

/**
 * ✅ AI챗을 여는 방법이 두 갈래(헤더의 전역 패널 vs 홈 화면 카드들의 자체 Dialog)로 나뉘어
 *   있던 게 "모바일→웹, 웹→모바일 전환 시 AI챗이 왼쪽에 중복으로 뜨고 홈이 안 보이는" 버그의
 *   원인이었습니다. 이제 어디서 열든 이 훅 하나만 씁니다.
 * ✅ 수정(2026-09) — "리브 페이지"(구 /ai 라우트) 완전 삭제. 예전엔 모바일에서 이 훅이
 *   context를 채운 뒤 router.push("/ai")로 그 라우트까지 이동시켰는데, 라우트 자체가
 *   없어졌고 전역으로 마운트된 AiMobileSheet(모달)가 isOpen만 보고 알아서 뜨므로
 *   라우팅이 필요 없어졌습니다 — 데스크톱/모바일 모두 open() 한 줄로 통일.
 */
export function useOpenAiChat() {
  const { open } = useAiPanel();

  return (prompt?: string, groupId?: number) => {
    open(prompt, groupId);
  };
}
