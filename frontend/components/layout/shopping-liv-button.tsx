"use client";

import { useEffect, useState } from "react";
import { useAiPanel } from "./ai-panel-context";
import { AUTH_CHANGED_EVENT } from "@/lib/api-client";
import { getSessionId, SESSION_CHANGED_EVENT } from "@/lib/session";
import { readProactiveNotifications, type ProactiveNotificationRecord } from "@/lib/proactive-notifications";

/** 장보기의 현재 스캔 세션에 도착한 안내를 결제 버튼 옆에서 바로 보여준다. */
export function ShoppingLivButton({ onAsk, compact = false }: { onAsk: () => void; compact?: boolean }) {
  const { isOpen, close, openSession } = useAiPanel();
  const [items, setItems] = useState<ProactiveNotificationRecord[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => {
      const sid = getSessionId();
      setItems(sid ? readProactiveNotifications().filter(n => n.sessionId === sid && !n.read) : []);
    };
    const reset = () => { setItems([]); setDismissed(null); };
    sync();
    const events = ["storeflow:proactive-notifications-changed", SESSION_CHANGED_EVENT, "storage"];
    events.forEach(name => window.addEventListener(name, sync));
    window.addEventListener(AUTH_CHANGED_EVENT, reset);
    return () => {
      events.forEach(name => window.removeEventListener(name, sync));
      window.removeEventListener(AUTH_CHANGED_EVENT, reset);
    };
  }, []);
  const latest = items[0];
  const showPreview = !isOpen && latest && dismissed !== latest.id;
  const openNotice = () => {
    const sid = getSessionId();
    if (!latest || latest.sessionId !== sid || !sid) return;
    const match = /^px-(\d+)$/.exec(latest.id);
    openSession(sid, match ? Number(match[1]) : undefined);
  };
  return (
    <div className="relative shrink-0">
      {showPreview && (
        <div role="status" aria-live="polite" className="absolute bottom-full right-0 z-[110] mb-3 w-[min(320px,calc(100vw-32px))] rounded-2xl border border-brand bg-background p-3 shadow-lg">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-brand">리브의 새 안내</span>
            <button type="button" aria-label="리브 안내 미리보기 닫기" onClick={() => setDismissed(latest.id)} className="px-2 text-lg leading-none">×</button>
          </div>
          <button type="button" aria-label="리브 새 안내 자세히 보기" onClick={openNotice} className="block w-full text-left text-sm">
            <span className="line-clamp-3 break-words">{latest.content}</span>
            <span className="mt-2 block text-xs font-medium text-brand">안내 확인하기</span>
          </button>
        </div>
      )}
      <button type="button" aria-label={isOpen ? "리브 닫기" : "리브에게 물어보기"} aria-expanded={isOpen}
        onClick={() => { if (isOpen) close(); else if (latest) openNotice(); else onAsk(); }}
        className={compact
          ? "relative flex h-10 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm"
          : "relative flex h-[60px] w-[60px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border border-border bg-white/20 text-xs backdrop-blur-2xl"}>
        <img src={isOpen ? "/icons/liv-full.svg" : "/icons/liv-line.svg"} alt="" aria-hidden="true" className="h-[22px] w-[22px] shrink-0" />
        리브
        {items.length > 0 && <span aria-label={`읽지 않은 리브 알림 ${items.length}개`} className="absolute -right-1 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] text-primary-foreground">{items.length > 9 ? "9+" : items.length}</span>}
      </button>
    </div>
  );
}
