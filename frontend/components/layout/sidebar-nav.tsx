// ⚠ app-shell.tsx가 데스크톱 사이드바를 제거하는 쪽으로 바뀌면서, 이 컴포넌트는
//   더 이상 어디서도 import되지 않습니다. 안 쓰면 삭제해도 되는 파일입니다.
import Link from "next/link";
import { Home, Search, Sparkles, ShoppingCart, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "홈", icon: Home },
  { href: "/search", label: "검색", icon: Search },
  { href: "/ai", label: "AI", icon: Sparkles },
  { href: "/cart", label: "결제", icon: ShoppingCart },
  { href: "/mypage", label: "마이페이지", icon: User },
];

export function SidebarNav({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "w-56 flex-col gap-1 border-r border-border bg-sidebar p-4",
        className
      )}
    >
      {/* TODO: 로고 이미지 자리 */}
      <p className="mb-4 px-3 text-lg font-semibold">LOGO</p>
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Icon size={18} />
          {label}
        </Link>
      ))}
    </aside>
  );
}
