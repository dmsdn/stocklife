"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  Barcode,
  Heart,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";

export const navigationItems = [
  {
    href: "/",
    label: "홈",
    icon: Home,
  },
  {
    href: "/search",
    label: "검색",
    icon: Search,
  },
  {
    href: "/saved",
    label: "저장",
    icon: Heart,
  },
  {
    href: "/scan",
    label: "스캔",
    icon: Barcode,
  },
  {
    href: "/mypage",
    label: "마이",
    icon: User,
  },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="
        fixed
        bottom-0
        left-0
        right-0
        z-[100]
        flex
        border-t
        border-border
        bg-card
        pb-[env(safe-area-inset-bottom)]
        md:hidden
      "
      aria-label="하단 메뉴"
    >
      {navigationItems.map(
        ({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/" &&
              pathname.startsWith(`${href}/`));

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                `
                  flex
                  flex-1
                  flex-col
                  items-center
                  gap-1
                  py-2
                  text-xs
                `,
                active
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <Icon
                size={20}
                aria-hidden="true"
              />

              {label}
            </Link>
          );
        },
      )}
    </nav>
  );
}