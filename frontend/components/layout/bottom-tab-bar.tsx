"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Home,
  BotMessageSquare,
  Barcode,
  Heart,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { isLoggedIn } from "@/lib/api-client";
import { LoginRequiredDialog } from "@/components/domain/login-required-dialog";

// ✅ "검색" 빼고 AI챗으로 가는 아이콘으로 교체 (bot-message-square)
export const navigationItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/ai", label: "AI챗", icon: BotMessageSquare },
  { href: "/saved", label: "저장", icon: Heart, requiresLogin: true },
  { href: "/scan", label: "스캔", icon: Barcode, requiresLogin: true },
  { href: "/mypage", label: "마이", icon: User },
];

export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);

  const handleClick = (e: React.MouseEvent, href: string, requiresLogin?: boolean) => {
    if (requiresLogin && !isLoggedIn()) {
      e.preventDefault();
      setLoginDialogOpen(true);
      return;
    }
    router.push(href);
  };

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-[100] flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="하단 메뉴"
      >
        {navigationItems.map(({ href, label, icon: Icon, requiresLogin }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleClick(e, href, requiresLogin)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-xs",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      <LoginRequiredDialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} />
    </>
  );
}
