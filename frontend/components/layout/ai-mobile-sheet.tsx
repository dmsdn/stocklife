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
"use client";

import { useEffect, useState } from "react";
import { RiArrowDownSLine, RiMenuLine } from "@remixicon/react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { useAiPanel } from "./ai-panel-context";
import { useBottomBarVisibility } from "./bottom-bar-visibility-context";
import { useMediaQuery } from "@/lib/use-media-query";
import { AiChatBody } from "@/components/ai/ai-chat-body";
import { SessionListDrawer } from "@/components/ai/session-list-drawer";

export function AiMobileSheet() {
  const { isOpen, initialMessage, close } = useAiPanel();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  const [sessionListOpen, setSessionListOpen] = useState(false);

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
          {/* 위로 당겨서 연 시트 — 상단 핸들을 누르면 리브 쪽으로 내려가면서 닫힘 */}
          <DialogPrimitive.Close
            aria-label="시트 닫기"
            className="flex shrink-0 flex-col items-center gap-1 pb-1 pt-3"
          >
            <span className="h-1 w-10 rounded-full bg-[#eee]" />
          </DialogPrimitive.Close>

          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 pb-3">
            <button
              type="button"
              onClick={() => setSessionListOpen(true)}
              aria-label="지난 대화 목록"
              className="flex h-8 w-8 items-center justify-center text-muted-foreground"
            >
              <RiMenuLine size={20} />
            </button>
            <DialogPrimitive.Title className="text-sm font-semibold">
              리브에게 물어보기
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center text-muted-foreground"
            >
              <RiArrowDownSLine size={22} />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1">
            <AiChatBody initialMessage={initialMessage} />
          </div>

          <SessionListDrawer open={sessionListOpen} onClose={() => setSessionListOpen(false)} />
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
