"use client";

// ✅ 하단바 리디자인(2026-08) — 업로드된 참고 디자인(Frame 130 등) 그대로 재현:
//   화면 하단에 딱 붙는 기존 방식 대신, 아래위/좌우 여백을 두고 "떠 있는" 두 개의 캡슐로
//   분리했습니다 — 홈/스캔/저장/마이 4개가 든 큰 캡슐 + 오른쪽에 별도로 떨어진 원형
//   AI(리브) 버튼. 두 요소 모두 반투명 배경 + backdrop-blur로 아래 콘텐츠가 은은하게
//   비치게 했습니다(참고 이미지에서 카드 텍스트가 바 아래로 살짝 비치는 효과).
//   ⚠ "하단바에만 적용" 지시에 따라 이 플로팅+블러 처리는 하단바 한정입니다 — 다른
//   카드/다이얼로그는 기존 스타일(불투명 배경) 그대로입니다.
// ✅ 수정(2026-09) —
//   1) 반응형(요청 7번) — 예전엔 아이템마다 w-16 고정이라, 아주 좁은 화면(작은 폰)에서
//      캡슐+리브 버튼 폭 합이 화면보다 넓어질 수 있었음. 캡슐 안 아이템을 flex-1로
//      바꾸고 캡슐 자체는 w-full max-w-[280px]로 — 화면이 좁아지면 그만큼 같이 줄어듦.
//   2) 리브 버튼 위 안내 말풍선(요청 6번) — "liv에게 물어보세요", 처음 방문 때만(한 번
//      닫으면 localStorage에 저장돼 다시 안 뜸) 둥둥 뜨는 애니메이션 + 아래쪽으로 옅은
//      그림자. X로 닫음.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  RiHome5Line,
  RiHome5Fill,
  RiQrScanLine,
  RiQrScanFill,
  RiBookmarkLine,
  RiBookmarkFill,
  RiUser3Line,
  RiUser3Fill,
  RiCloseLine,
} from "@remixicon/react";

import { cn } from "@/lib/utils";
import { useBottomBarVisibility } from "./bottom-bar-visibility-context";
import { useAiPanel } from "./ai-panel-context";

export const navigationItems = [
  { href: "/", label: "홈", LineIcon: RiHome5Line, FillIcon: RiHome5Fill },
  { href: "/saved", label: "저장", LineIcon: RiBookmarkLine, FillIcon: RiBookmarkFill },
  { href: "/scan", label: "스캔", LineIcon: RiQrScanLine, FillIcon: RiQrScanFill },
  { href: "/mypage", label: "마이", LineIcon: RiUser3Line, FillIcon: RiUser3Fill },
];

const AI_ITEM = { label: "리브" };
const LIV_HINT_DISMISSED_KEY = "storeflow_liv_hint_dismissed";

export function BottomTabBar() {
  const pathname = usePathname();
  const { hidden } = useBottomBarVisibility();
  // ✅ 리브는 더 이상 /ai로 이동하지 않고, 아래에서 올라오는 바텀시트(AiMobileSheet)를 엶.
  const { isOpen: aiOpen, open: openAiPanel } = useAiPanel();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  // ✅ 신규 — 리브 버튼 위 "liv에게 물어보세요" 안내 말풍선, 한 번 닫으면 다시 안 뜸.
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowHint(window.localStorage.getItem(LIV_HINT_DISMISSED_KEY) !== "1");
  }, []);
  const dismissHint = () => {
    setShowHint(false);
    window.localStorage.setItem(LIV_HINT_DISMISSED_KEY, "1");
  };

  if (hidden) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center gap-2 px-4 pb-[calc(1.75rem+env(safe-area-inset-bottom))] md:hidden"
      aria-label="하단 메뉴"
    >
      {/* 메인 캡슐 — 홈/스캔/저장/마이. 흰색 20% 투명 배경 + 보더는 100% 불투명, 흐림은
          진하게(backdrop-blur-2xl) — 그림자는 없앰(보더만). 높이는 h-16 고정, 아이템은 그 안에서
          세로 중앙정렬만 해서 리브 원형 버튼과 정확히 같은 높이를 갖게 함.
          ✅ 수정 — w-16 고정 대신 flex-1 + 캡슐 자체 w-full max-w-[280px]로 반응형화. */}
      <div className="flex h-16 w-full max-w-[280px] items-center gap-1 rounded-full border border-border bg-white/20 px-2 backdrop-blur-2xl">
        {navigationItems.map(({ href, label, LineIcon, FillIcon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-xs",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {active ? (
                <FillIcon size={22} aria-hidden="true" />
              ) : (
                <LineIcon size={22} aria-hidden="true" />
              )}
              {label}
            </Link>
          );
        })}
      </div>

      {/* 분리된 원형 캡슐 — AI(리브) 전용, liv 로고 사용. w-16 h-16로 정사각형을 고정해야
          rounded-full이 진짜 "원"이 됨 (패딩 기반 크기는 텍스트 길이에 따라 타원이 될 수 있음),
          h-16는 왼쪽 메인 캡슐과 동일한 값이라 높이도 항상 같이 감 */}
      <div className="relative shrink-0">
        {showHint && !aiOpen && (
          <div
            className="absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 animate-[badge-float_2s_ease-in-out_infinite] items-center gap-1 whitespace-nowrap rounded-full border border-main bg-white py-2 pl-3 pr-2 text-xs font-medium text-black shadow-[0_6px_14px_rgba(0,0,0,0.12)]"
          >
            liv에게 물어보세요
            {/* ✅ 수정 — 참고 이미지(Union.png)처럼 각진 다이아몬드 대신 둥근 말풍선 꼬리로.
                테두리색 삼각형(살짝 크게) 위에 흰색 삼각형(살짝 작게)을 겹쳐서, 테두리만
                가늘게 보이는 꼬리를 만듦. */}
            <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-[7px] border-r-[7px] border-t-[9px] border-l-transparent border-r-transparent border-t-main" />
            <span className="absolute left-1/2 top-full -mt-px h-0 w-0 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[7px] border-l-transparent border-r-transparent border-t-white" />
            <button
              type="button"
              onClick={dismissHint}
              aria-label="안내 닫기"
              className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-black/60"
            >
              <RiCloseLine size={14} />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (showHint) dismissHint();
            openAiPanel();
          }}
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border border-border bg-white/20 text-xs backdrop-blur-2xl"
        >
          <img
            src={aiOpen ? "/icons/liv-full.svg" : "/icons/liv-line.svg"}
            alt=""
            aria-hidden="true"
            className="h-[22px] w-[22px]"
          />
          <span className={aiOpen ? "text-foreground" : "text-muted-foreground"}>
            {AI_ITEM.label}
          </span>
        </button>
      </div>
    </nav>
  );
}
