// ⚠ 최종 IA 결정(홈·저장·스캔·히스토리·마이페이지 5개)과 아래 항목 구성이 다릅니다.
//   /history, 통합된 /saved 페이지가 아직 없어서 임의로 연결하지 않고 마지막 빌드 상태 그대로 둡니다.
//   재정리 시 items 배열과 아래 링크된 라우트를 최종안 기준으로 교체하세요.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Barcode, Heart, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "홈", icon: Home },
  { href: "/search", label: "검색", icon: Search },
  { href: "/saved", label: "저장", icon: Heart },
  { href: "/scan", label: "스캔", icon: Barcode },
  { href: "/mypage", label: "마이", icon: User },
];

export function BottomTabBar() {
  const pathname = usePathname();
  const hideOnScroll = pathname.startsWith("/mypage");

  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (!hideOnScroll) {
      setHidden(false);
      return;
    }

    lastScrollY.current = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const scrollingDown = currentY > lastScrollY.current;
      setHidden(scrollingDown && currentY > 80);
      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hideOnScroll]);

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 flex border-t border-border bg-card transition-transform duration-200 md:hidden",
        hidden ? "translate-y-full" : "translate-y-0"
      )}
    >
      {items.map(({ href, label, icon: Icon }) => {
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
