"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BotMessageSquare,
  Barcode,
  Bookmark,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";

// ✅ 저장/스캔은 비회원도 이미 쓸 수 있는 구조라(로컬 저장 + X-Session-Id로 서버에도
//   게스트 신분으로 저장, 로그인하면 migrateGuestCartToAccount로 그대로 승계됨),
//   하단탭 단계에서 막던 requiresLogin을 없앴습니다. 로그인은 결제(체크아웃) 시점에만
//   요구합니다 — cart/page.tsx 참고.
export const navigationItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/ai", label: "AI챗", icon: BotMessageSquare },
  { href: "/saved", label: "저장", icon: Bookmark },
  { href: "/scan", label: "스캔", icon: Barcode },
  { href: "/mypage", label: "마이", icon: User },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="하단 메뉴"
    >
      {navigationItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon size={24} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
