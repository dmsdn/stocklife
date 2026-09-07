// components/layout/ai-proactive-bubble.tsx
// ✅ PRODUCT.md 6번 "알림 AI" 명세 반영 — 챗봇 에이전트(세션=저장 리스트 단위)와는
//   완전히 다른 개념입니다. 화면과 무관하게 하단바 위에 상주하는 자발형 말풍선이고,
//   눌러도 채팅 세션을 시작하지 않습니다(그러면 챗봇 에이전트랑 시각적으로 헷갈림 —
//   PRODUCT.md가 "두 에이전트를 혼동되게 만들지 말 것"이라고 명시).
// ⚠ 백엔드 구매주기 예측 API가 아직 없어서, 지금은 이미 연결된 "자주 구매하는 상품"
//   1순위로 흉내만 냅니다. 실제 API(POST /api/ai/proactive 등) 생기면 이 fetch만
//   교체하면 됩니다.
"use client";

import { useEffect, useState } from "react";
import { RiSparkling2Line, RiCloseLine } from "@remixicon/react";
import { apiFetch, isLoggedIn } from "@/lib/api-client";
import { useAiPanel } from "./ai-panel-context";

export function AiProactiveBubble() {
  const { isOpen } = useAiPanel();
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) return;
    apiFetch<{ skuId: number; productName: string; purchaseCount: number }[]>("/api/orders/frequent")
      .then((list) => {
        if (list[0]) setMessage(`${list[0].productName} 살 때 되지 않았나요?`);
      })
      .catch(() => {});
  }, []);

  // ✅ 수정(2026-09) — "리브 페이지"(구 /ai 라우트)가 삭제되면서 pathname으로 채팅 화면
  //   여부를 판단할 수 없어짐. 이제 리브가 모달로만 뜨므로, 그 모달이 열려있는 동안(isOpen)
  //   숨기면 된다(겹쳐 보이는 문제 방지).
  if (isOpen || !message || dismissed) return null;

  // ✅ 수정(요청) — 하단 다크 토스트 대신, 헤더의 AI 아이콘(logo-ai.svg, 좌측 상단)에서
  //   말이 나오는 것처럼 화면 상단에 말풍선으로. 화살표(꼬리)는 그 아이콘 쪽을 가리키도록
  //   말풍선 왼쪽 상단에 붙임. 색은 주황 테두리 + 흰 배경 + 검은 텍스트.
  return (
    <div className="fixed inset-x-0 top-16 z-[90] flex justify-start px-4 md:top-20">
      <div className="relative mt-3 max-w-sm">
        {/* 말풍선 꼬리(화살표) — 왼쪽 상단, 위쪽(AI 아이콘 방향)을 가리키게 */}
        <div className="absolute -top-[7px] left-5 h-3 w-3 rotate-45 border-l border-t border-main bg-white" />

        <div className="flex items-center gap-2 rounded-lg border border-main bg-white px-4 py-3 text-foreground">
          <RiSparkling2Line size={16} className="shrink-0 text-main" />
          <p className="min-w-0 flex-1 truncate text-sm">{message}</p>
          <button
            type="button"
            aria-label="닫기"
            onClick={() => {
              setDismissed(true);
              // ✅ PRODUCT.md: "알림함에 자동 기록됨" — 실제 저장 API는 없어서 지금은
              //   그냥 닫기만 동작. 알림함 저장 API 생기면 여기서 POST 호출 추가.
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <RiCloseLine size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
