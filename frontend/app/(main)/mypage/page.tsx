// app/(main)/mypage/page.tsx
// ✅ 찜, 최근 본 메뉴 삭제 (요청사항) — 남은 회원전용: 구매내역/전자영수증/취소반품환불
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ShoppingBag,
  Receipt,
  RotateCcw,
  Award,
  Megaphone,
  Bell,
  FileText,
  HelpCircle,
  LogOut,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/footer";
import { isLoggedIn as checkLoggedIn, clearTokens } from "@/lib/api-client";
import { logout } from "@/lib/auth";

const memberOnlyMenuItems = [
  { href: "/mypage/orders", label: "구매내역", icon: ShoppingBag },
  { href: "/mypage/receipts", label: "전자 영수증", icon: Receipt },
  { href: "/mypage/refunds", label: "취소 / 반품 / 환불 내역", icon: RotateCcw },
];

const commonMenuItems = [
  { href: "/mypage/tier-guide", label: "등급 안내", icon: Award },
  { href: "/mypage/notices", label: "공지사항", icon: Megaphone },
  { href: "/mypage/notifications", label: "알림 설정", icon: Bell },
  { href: "/mypage/terms", label: "이용약관", icon: FileText },
  { href: "/mypage/faq", label: "FAQ", icon: HelpCircle },
];

export default function MyPage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const stats = { point: 1000, coupon: 21, review: 21 };

  useEffect(() => {
    setLoggedIn(checkLoggedIn());
  }, []);

  const menuItems = loggedIn ? [...memberOnlyMenuItems, ...commonMenuItems] : commonMenuItems;

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      clearTokens();
    }
    setLoggedIn(false);
    router.push("/");
  };

  return (
    <div>
      <div className="mx-auto max-w-md p-4 md:max-w-4xl md:p-8">
        <p className="mb-4 text-base md:hidden">mypage</p>

        <div className="mb-6 grid gap-6 md:grid-cols-[280px_1fr] md:items-start">
          <div className="space-y-4">
            {loggedIn ? (
              <div className="flex items-center gap-3">
                <Link href="/mypage/account" className="flex flex-1 items-center gap-3">
                  <div className="h-14 w-14 shrink-0 rounded-full bg-muted" />
                  <div>
                    <p className="text-sm text-muted-foreground">등급</p>
                    <p className="text-base">닉네임</p>
                  </div>
                </Link>
                <button type="button" onClick={handleLogout} aria-label="로그아웃" className="text-muted-foreground">
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-lg font-medium">회원가입 하고 이용해보세요</p>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/auth/login">
                    <Button variant="outline" className="w-full">로그인</Button>
                  </Link>
                  <Link href="/auth/signup">
                    <Button className="w-full">회원가입</Button>
                  </Link>
                </div>
              </div>
            )}

            {loggedIn && (
              <Card className="grid grid-cols-3 divide-x divide-border p-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">포인트</p>
                  <p className="text-base font-semibold">{stats.point.toLocaleString()}p</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">쿠폰</p>
                  <p className="text-base font-semibold">{stats.coupon}개</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">리뷰</p>
                  <p className="text-base font-semibold">{stats.review}개</p>
                </div>
              </Card>
            )}
          </div>

          <div className="divide-y divide-border md:hidden">
            {menuItems.map((item) => (
              <Link key={item.href} href={item.href} className="flex items-center justify-between py-3 text-sm">
                {item.label}
                <ChevronRight size={16} className="text-muted-foreground" />
              </Link>
            ))}
          </div>

          <div className="hidden grid-cols-3 gap-3 md:grid lg:grid-cols-4">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-2 rounded-lg border border-border p-5 text-center hover:bg-muted"
              >
                <item.icon size={22} className="text-muted-foreground" />
                <span className="text-sm">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
