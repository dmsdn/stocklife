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

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[90] flex justify-center px-4 md:bottom-4">
      <div className="flex max-w-sm items-center gap-2 rounded-lg bg-foreground px-4 py-3 text-background ring-1 ring-foreground/10">
        <RiSparkling2Line size={16} className="shrink-0" />
        <p className="min-w-0 flex-1 truncate text-sm">{message}</p>
        <button
          type="button"
          aria-label="닫기"
          onClick={() => {
            setDismissed(true);
            // ✅ PRODUCT.md: "알림함에 자동 기록됨" — 실제 저장 API는 없어서 지금은
            //   그냥 닫기만 동작. 알림함 저장 API 생기면 여기서 POST 호출 추가.
          }}
          className="shrink-0 text-background/70 hover:text-background"
        >
          <RiCloseLine size={16} />
        </button>
      </div>
    </div>
  );
}
