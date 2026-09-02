"use client";

// ✅ 하단바 리디자인(2026-08) — 업로드된 참고 디자인(Frame 130 등) 그대로 재현:
//   화면 하단에 딱 붙는 기존 방식 대신, 아래위/좌우 여백을 두고 "떠 있는" 두 개의 캡슐로
//   분리했습니다 — 홈/스캔/저장/마이 4개가 든 큰 캡슐 + 오른쪽에 별도로 떨어진 원형
//   AI(리브) 버튼. 두 요소 모두 반투명 배경 + backdrop-blur로 아래 콘텐츠가 은은하게
//   비치게 했습니다(참고 이미지에서 카드 텍스트가 바 아래로 살짝 비치는 효과).
//   ⚠ "하단바에만 적용" 지시에 따라 이 플로팅+블러 처리는 하단바 한정입니다 — 다른
//   카드/다이얼로그는 기존 스타일(불투명 배경) 그대로입니다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RiHome5Line,
  RiHome5Fill,
  RiQrScanLine,
  RiQrScanFill,
  RiBookmarkLine,
  RiBookmarkFill,
  RiUser3Line,
  RiUser3Fill,
} from "@remixicon/react";

import { cn } from "@/lib/utils";

export const navigationItems = [
  { href: "/", label: "홈", LineIcon: RiHome5Line, FillIcon: RiHome5Fill },
  { href: "/scan", label: "스캔", LineIcon: RiQrScanLine, FillIcon: RiQrScanFill },
  { href: "/saved", label: "저장", LineIcon: RiBookmarkLine, FillIcon: RiBookmarkFill },
  { href: "/mypage", label: "마이", LineIcon: RiUser3Line, FillIcon: RiUser3Fill },
];

const AI_ITEM = { href: "/ai", label: "리브" };

export function BottomTabBar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden"
      aria-label="하단 메뉴"
    >
      {/* 메인 캡슐 — 홈/스캔/저장/마이. 높이는 h-16 고정, 아이템은 그 안에서 세로 중앙정렬만
          해서 리브 원형 버튼과 정확히 같은 높이를 갖게 함 (패딩으로 높이를 만들면 둘이 미묘하게
          어긋나기 쉬움) */}
      <div className="flex h-16 items-center gap-1 rounded-full border border-border/60 bg-background/10 px-2 shadow-lg backdrop-blur-md">
        {navigationItems.map(({ href, label, LineIcon, FillIcon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-full w-16 flex-col items-center justify-center gap-0.5 rounded-full text-xs",
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
      <Link
        href={AI_ITEM.href}
        className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border border-border/60 bg-background/10 text-xs shadow-lg backdrop-blur-md"
      >
        <img
          src={isActive(AI_ITEM.href) ? "/icons/liv-full.svg" : "/icons/liv-line.svg"}
          alt=""
          aria-hidden="true"
          className="h-[22px] w-[22px]"
        />
        <span className={isActive(AI_ITEM.href) ? "text-foreground" : "text-muted-foreground"}>
          {AI_ITEM.label}
        </span>
      </Link>
    </nav>
  );
}
