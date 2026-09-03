// components/layout/ai-mobile-sheet.tsx
// ✅ 이 컴포넌트가 실제로 하단탭 "리브"를 눌렀을 때 뜨는 모바일 바텀시트입니다
//   (AppShell이 모든 페이지에 전역으로 렌더링 — components/layout/app-shell.tsx 참고).
// ⚠ 이전에 진짜 Dialog(base-ui, 포털 렌더링 + 포커스 트랩 + 배경 클릭 자동 처리)로
//   바꾸는 작업이 실수로 components/ai/ai-chat-panel.tsx에 적용됐는데, 그 파일은
//   앱 어디에서도 import되지 않는 미사용 컴포넌트였습니다(실제로 화면에 뜨는 건
//   항상 이 파일). 그래서 겉보기엔 고쳤는데 실제 버그(배경 클릭됨, 화면 전환돼도
//   안 없어짐, 뒤쪽 하단탭바가 클릭을 가로챔)는 하나도 안 바뀌었던 것 — 이번에
//   진짜 Dialog로의 전환을 여기, 실제로 쓰이는 컴포넌트에 적용합니다.
//   매장 지도 다이얼로그(store-map-dialog.tsx)와 동일한 Dialog/DialogPortal/
//   DialogOverlay를 그대로 재사용하고, Popup만 바텀시트 모양으로 직접 스타일링했습니다.
// ⚠ 그런데도 남아있던 같은 증상(뒤 화면만 눌림, 시트가 너무 낮음)의 진짜 원인을 찾음 —
//   시트 높이를 h-[92dvh]로 계산했는데, 이 동적 뷰포트 단위가 안 먹는 환경에서는
//   시트가 화면 아래쪽 끝까지 안 닿고 중간에서 짧게 잘려버립니다. 그러면 실제로 안 덮인
//   아래쪽 빈틈(및 그 뒤에 있던 하단탭바·페이지)이 그대로 클릭됨 — "화면이 낮다"는 증상과
//   "뒤 화면만 눌린다"는 증상이 사실 하나의 원인이었습니다. dvh에 기대는 대신
//   top-10(위쪽 살짝 남기기) ~ bottom-0(화면 맨 아래까지)으로 고정해서, 뷰포트 단위
//   지원 여부와 무관하게 항상 화면 맨 아래까지 확실히 덮도록 고쳤습니다.
// ⚠ z-index도 여유 있게 올림 — 앱 안에 이미 z-[120](장바구니 담기 시트) 등 이 시트보다
//   높은 값이 있어서, 이 모달은 "어디서든 열리는 전역 모달"답게 항상 최상단이어야 합니다.
// ✅ 수정(2026-09) — "리브 페이지"(구 /ai 라우트) 완전 삭제에 맞춰 이 모달이 유일한
//   진입점이 됨. context의 sessionId/highlightMessageId를 받아 특정 대화를 이어서 열 수
//   있게 하고, 헤더 타이틀도 고정 문구 대신 그 대화의 실제 이름(+로컬 이름수정)을 보여줌.
"use client";

import { useEffect, useRef, useState } from "react";
import { RiArrowDownSLine, RiMenuLine, RiPencilLine, RiCheckLine } from "@remixicon/react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { useAiPanel } from "./ai-panel-context";
import { useBottomBarVisibility } from "./bottom-bar-visibility-context";
import { useMediaQuery } from "@/lib/use-media-query";
import { apiFetch } from "@/lib/api-client";
import { AiChatBody } from "@/components/ai/ai-chat-body";
import { SessionListDrawer } from "@/components/ai/session-list-drawer";

export function AiMobileSheet() {
  const { isOpen, initialMessage, sessionId, highlightMessageId, openSession, close } = useAiPanel();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  const [sessionListOpen, setSessionListOpen] = useState(false);

  // ✅ 신규 — 손잡이(핸들)를 잡고 아래로 끌면 그만큼 시트가 따라 내려오다가, 일정 거리
  //   이상 끌면 닫힘. 살짝만 끌고 놓으면 원래 자리로 스냅백(그냥 탭한 거면 dragDistance가
  //   0에 가까워서 기존처럼 탭-닫기로 처리).
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const DRAG_CLOSE_THRESHOLD = 120;

  const handleDragStart = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    setDragging(true);
  };
  const handleDragMove = (e: React.PointerEvent) => {
    if (dragStartY.current == null) return;
    const delta = e.clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  };
  const handleDragEnd = () => {
    setDragging(false);
    if (dragY > DRAG_CLOSE_THRESHOLD) {
      close();
    }
    setDragY(0);
    dragStartY.current = null;
  };

  // ✅ AiChatBody가 실제로 활성화(또는 새로 생성)한 sessionId. context의 sessionId는
  //   "이미 있는 대화를 이어서 열 때"만 채워지고, 새 대화는 AiChatBody가 만들기 전까지
  //   모름 — 그래서 별도 state로 추적해서 헤더 타이틀/이름수정에 씀.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId);
  const [serverTitle, setServerTitle] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    setActiveSessionId(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      setServerTitle(null);
      return;
    }
    apiFetch<{ title: string | null }>(`/api/chat/sessions/${activeSessionId}`)
      .then((s) => setServerTitle(s.title))
      .catch(() => setServerTitle(null));
  }, [activeSessionId]);

  const displayTitle = activeSessionId ? serverTitle ?? "새로운 대화" : "새로운 대화";

  const startEditTitle = () => {
    if (!activeSessionId) return; // 세션이 아직 없으면(첫 메시지 전) 이름 붙일 대상이 없음
    setTitleDraft(displayTitle);
    setEditingTitle(true);
  };

  // ✅ 수정(2026-09) — 백엔드에 실제 PATCH /api/chat/sessions/{sessionId} (body: {title})가
  //   생겨서, 로컬 임시 저장(lib/session-title-override.ts) 대신 이걸 직접 씀 — 이제 다른
  //   기기/브라우저에서도 바뀐 이름이 그대로 보입니다.
  const commitTitle = async () => {
    if (!activeSessionId) {
      setEditingTitle(false);
      return;
    }
    const next = titleDraft.trim();
    if (!next) {
      setEditingTitle(false);
      return;
    }
    setRenaming(true);
    try {
      const updated = await apiFetch<{ title: string | null }>(`/api/chat/sessions/${activeSessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: next }),
      });
      setServerTitle(updated.title ?? next);
    } catch {
      // 실패해도 화면엔 일단 반영(다음에 다시 열면 서버 값으로 되돌아갈 수 있음)
      setServerTitle(next);
    } finally {
      setRenaming(false);
      setEditingTitle(false);
    }
  };

  useEffect(() => {
    if (!isDesktop) setBottomBarHidden(isOpen);
    return () => setBottomBarHidden(false);
  }, [isOpen, isDesktop, setBottomBarHidden]);

  // 데스크톱에서는 이 시트 자체를 렌더링하지 않음(오른쪽 AiPanel이 그 역할을 대신함).
  // Dialog가 안 열려 있을 땐 base-ui가 알아서 포털/DOM에서 정리하므로,
  // 예전처럼 "한 번이라도 열렸으면 계속 mounted 유지" 같은 수동 상태가 필요 없습니다 —
  // 대화 내용은 세션 단위로 서버에 저장되기 때문에(lib/session.ts) 다시 열려도 이어집니다.
  if (isDesktop) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogPortal>
        {/* ✅ z-[140] — 앱에서 가장 높은 z-index(장바구니 담기 시트 z-[120])보다도 위.
            이 백드롭이 뒤쪽 하단탭바(z-[100])·리브 제안 버블(z-[90]) 등 모든 걸 확실히
            덮어서, 시트 바깥(위쪽 살짝 보이는 영역)을 눌러도 배경이 아니라 이 백드롭이
            클릭을 받게 함(눌러서 닫기). */}
        <DialogOverlay className="z-[140] md:hidden" />

        {/* ✅ dvh 대신 top-10(2.5rem)/bottom-0 고정 — 뷰포트 단위 지원 여부와 무관하게
            항상 화면 맨 아래까지 확실히 닿음(안 그러면 아래쪽이 안 덮여서 그 틈으로 뒤
            화면이 클릭됨). z-[150]으로 백드롭보다도 위, 앱 전체에서 최상단. */}
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          style={{
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            transition: dragging ? "none" : "transform 0.2s ease-out",
          }}
          className="
            fixed inset-x-0 top-10 bottom-0 z-[150] flex w-full
            flex-col overflow-hidden rounded-t-[20px] border-none bg-background p-0
            text-sm text-popover-foreground shadow-[0_-4px_30px_rgba(0,0,0,0.15)]
            outline-none duration-300 ease-out
            data-open:animate-in data-open:slide-in-from-bottom
            data-closed:animate-out data-closed:slide-out-to-bottom
            md:hidden
          "
        >
          {/* ✅ 신규 — 손잡이를 손가락/마우스로 잡고 아래로 끌면 시트가 따라 내려오다가
              일정 거리 이상이면 닫힘(handleDragEnd). 살짝 끌었다 놓으면 스냅백. 그냥
              탭만 하면(끈 거리 0) 기존처럼 닫힘. */}
          <div
            role="button"
            aria-label="시트 닫기(끌어서 닫기)"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            onClick={() => dragY === 0 && close()}
            className="flex shrink-0 touch-none flex-col items-center gap-1 pb-1 pt-3"
          >
            <span className="h-1 w-10 rounded-full bg-[#eee]" />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 pb-3">
            <button
              type="button"
              onClick={() => setSessionListOpen(true)}
              aria-label="지난 대화 목록"
              className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
            >
              <RiMenuLine size={20} />
            </button>

            {/* ✅ 수정 — 고정 문구 "리브에게 물어보기" 대신 실제 대화 이름. 눌러서 인라인 수정. */}
            {editingTitle ? (
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTitle();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 text-center text-sm outline-none"
                />
                <button type="button" onClick={commitTitle} disabled={renaming} aria-label="이름 저장" className="shrink-0 text-primary disabled:opacity-50">
                  <RiCheckLine size={18} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startEditTitle}
                className="flex min-w-0 flex-1 items-center justify-center gap-1 text-sm font-semibold disabled:opacity-60"
                disabled={!activeSessionId}
              >
                <span className="truncate">{displayTitle}</span>
                {activeSessionId && <RiPencilLine size={13} className="shrink-0 text-muted-foreground" />}
              </button>
            )}

            <DialogPrimitive.Close
              aria-label="닫기"
              className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
            >
              <RiArrowDownSLine size={22} />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1">
            <AiChatBody
              sessionIdOverride={sessionId ?? undefined}
              initialMessage={initialMessage}
              highlightMessageId={highlightMessageId ?? undefined}
              onSessionReady={setActiveSessionId}
            />
          </div>

          <SessionListDrawer
            open={sessionListOpen}
            onClose={() => setSessionListOpen(false)}
            currentSessionId={activeSessionId}
            onSelect={(id) => openSession(id)}
          />
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
