// components/layout/ai-panel.tsx
// ✅ position:fixed 패널 — 더 이상 main과 같은 flex row에서 높이를 "공유"하지 않는다.
//   왼쪽 컨텐츠가 얼마나 길든, 문서 스크롤이 얼마나 내려가든 이 패널은 뷰포트 기준
//   top-16(헤더 아래) ~ bottom-0 에 고정되고, 내부는 AiChatBody가 자체 스크롤한다.
//   대신 패널이 열려 있을 때 본문이 패널 밑에 깔리지 않도록 AppShell에서 main에 오른쪽
//   여백(md:mr-[420px])을 별도로 준다.
// ✅ 수정(2026-09) — "리브 페이지"(구 /ai 라우트) 완전 삭제. 예전엔 모바일 폭에서 패널이
//   열리면 무조건 /ai로 강제 이동시켰는데, 이제 그 라우트 자체가 없어졌고 모바일은 항상
//   AiMobileSheet(모달)가 담당하므로 이 리다이렉트가 불필요 + 오히려 존재하지 않는 라우트로
//   보내는 버그가 됨. 세션 전환(openSession)도 라우팅 없이 이 컨텍스트만으로 동작.
"use client";

import { useMediaQuery } from "@/lib/use-media-query";
import { useState } from "react";
import { RiCloseLine, RiMenuLine, RiAddLine } from "@remixicon/react";
import { useAiPanel } from "./ai-panel-context";
import { AiChatBody } from "@/components/ai/ai-chat-body";
import { SessionListDrawer } from "@/components/ai/session-list-drawer";
import { startNewSession } from "@/lib/session";

export function AiPanel() {
  const { isOpen, initialMessage, sessionId, highlightMessageId, close, openSession } = useAiPanel();
  // ✅ 신규(요청 — "채팅 새로 시작하기가 없음") — 데스크탑 패널엔 대화 목록 자체가 아예
  //   없었습니다(모바일 시트에만 있었음). 같은 SessionListDrawer를 그대로 붙임.
  const [sessionListOpen, setSessionListOpen] = useState(false);

  const isDesktop = useMediaQuery("(min-width: 768px)");
  if (!isOpen || !isDesktop) return null;

  return (
    <aside className="fixed right-0 top-16 bottom-0 z-[90] hidden w-[420px] flex-col overflow-hidden border-l border-border bg-background md:flex">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4">
        <button
          type="button"
          onClick={() => setSessionListOpen(true)}
          aria-label="지난 대화 목록"
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
        >
          <RiMenuLine size={20} />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-lg font-semibold">AI에게 물어보기</span>
        <button
          type="button"
          onClick={async () => openSession(await startNewSession())}
          aria-label="새 대화"
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
        >
          <RiAddLine size={20} />
        </button>
        <button type="button" onClick={close} aria-label="AI 패널 닫기" className="shrink-0">
          <RiCloseLine size={24} />
        </button>
      </div>
      <AiChatBody
        sessionIdOverride={sessionId ?? undefined}
        initialMessage={initialMessage}
        highlightMessageId={highlightMessageId ?? undefined}
      />
      <SessionListDrawer
        open={sessionListOpen}
        onClose={() => setSessionListOpen(false)}
        currentSessionId={sessionId}
        onSelect={(id) => openSession(id)}
        onNewSession={(id) => openSession(id)}
      />
    </aside>
  );
}
