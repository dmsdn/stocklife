"use client";

import { useState } from "react";
import { useAiPanel } from "./ai-panel-context";
import { getOrCreateSessionId } from "@/lib/session";

/** 스캔 이벤트와 같은 활성 대화를 열어 이미 도착한 안내도 이어서 보여준다. */
export function ShoppingLivToggle() {
  const { isOpen, close, openSession, unread } = useAiPanel();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const toggle = async () => {
    if (isOpen) { close(); return; }
    if (opening) return;
    setOpening(true); setError("");
    try {
      // trackConsumerEvent와 같은 세션 선택. 여기서 새 목록 대화를 만들면 스캔 안내가 분리된다.
      const session = await getOrCreateSessionId();
      openSession(session);
    } catch {
      setError("리브를 열지 못했어요. 다시 눌러 주세요.");
    } finally { setOpening(false); }
  };
  return (
    <div className="absolute right-4">
      <button type="button" onClick={() => void toggle()} disabled={opening}
        aria-label={isOpen ? "리브 닫기" : "리브 열기"} aria-expanded={isOpen}
        className="relative flex h-10 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm disabled:opacity-50">
        <img src={isOpen ? "/icons/liv-full.svg" : "/icons/liv-line.svg"} alt="" className="h-5 w-5" />
        <span>리브</span>
        {unread > 0 && <span aria-label={`읽지 않은 리브 알림 ${unread}개`}
          className="absolute -right-1 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {error && <p role="alert" className="absolute right-0 top-12 z-50 w-56 rounded-lg border bg-background p-2 text-xs">{error}</p>}
    </div>
  );
}
