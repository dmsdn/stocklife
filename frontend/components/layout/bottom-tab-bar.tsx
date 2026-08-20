// ⚠ 최종 IA 결정(홈·저장·스캔·히스토리·마이페이지 5개)과 아래 항목 구성이 다릅니다.
//   /history, 통합된 /saved 페이지가 아직 없어서 임의로 연결하지 않고 마지막 빌드 상태 그대로 둡니다.
//   재정리 시 items 배열과 아래 링크된 라우트를 최종안 기준으로 교체하세요.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Barcode, Heart, User } from "lucide-react";
import { cn } from "@/lib/utils";

export const navigationItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/search", label: "검색", icon: Search },
  { href: "/saved", label: "저장", icon: Heart },
  { href: "/scan", label: "스캔", icon: Barcode },
  { href: "/mypage", label: "마이", icon: User },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {navigationItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DesktopTopNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="주요 메뉴">
      {navigationItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;

        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            title={label}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon size={19} aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}
