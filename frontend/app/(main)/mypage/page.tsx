// app/(main)/mypage/page.tsx
// ✅ 메뉴를 주문 관리/혜택/활동/정보/고객센터 5개 카테고리 페이지로 재구성했습니다.
//    프로필 아이콘 제거, 로그아웃은 맨 아래로, 저장/최근본/전자영수증 아래에
//    최근 공지 1개 미리보기(제목만) 추가.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ShoppingBag,
  Gift,
  Activity,
  UserCircle,
  Headphones,
  Heart,
  Clock,
  Receipt,
  LogOut,
} from "lucide-react";
import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/footer";
import { LogoutButton } from "@/components/domain/logout-button";
import { isLoggedIn as checkLoggedIn } from "@/lib/api-client";
import { notices } from "./notices/page";

const categoryMenu = [
  { href: "/mypage/orders-management", label: "주문 관리", icon: ShoppingBag },
  { href: "/mypage/benefits", label: "혜택", icon: Gift },
  { href: "/mypage/activity", label: "활동", icon: Activity },
  { href: "/mypage/info", label: "정보", icon: UserCircle },
  { href: "/mypage/support", label: "고객센터", icon: Headphones },
];

const quickLinks = [
  { href: "/saved", label: "저장", icon: Heart },
  { href: "/mypage/recent", label: "최근 본", icon: Clock },
  { href: "/mypage/receipts", label: "전자영수증", icon: Receipt },
];

export default function MyPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(checkLoggedIn());
  }, []);

  const latestNotice = notices[0];

  return (
    <div className="flex min-h-full flex-col">
      <HomeAiHeader />
      <div className="mx-auto w-full flex-1 pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:max-w-4xl md:p-8 md:pb-8">
        <div className="grid gap-6 px-5 md:grid-cols-[280px_1fr] md:items-start">
          <div className="text-center text-sm font-medium">
            {loggedIn ? (
              <Link
                href="/mypage/account"
                className="my-5 flex items-center justify-between rounded-sm border border-border px-3 py-3"
              >
                <span className="text-base">내 정보</span>
                <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
              </Link>
            ) : (
              <div className="space-y-3">
                <p className="text-lg font-medium">회원가입 하고 이용해보세요</p>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/auth/login">
                    <Button variant="outline" className="w-full">로그인</Button>
                  </Link>
                  <Link href="/auth/signup/terms">
                    <Button className="w-full">회원가입</Button>
                  </Link>
                </div>
              </div>
            )}

            {loggedIn && (
              <div className="space-y-2 rounded-sm bg-muted">
                <div className="grid grid-cols-3 gap-1">
                  {quickLinks.map((q) => (
                    <Link
                      key={q.href}
                      href={q.href}
                      className="flex flex-col items-center gap-1 rounded-sm py-6 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <q.icon size={18} />
                      {q.label}
                    </Link>
                  ))}
                </div>

                {latestNotice && (
                  <Link
                    href={`/mypage/notices/${latestNotice.id}`}
                    className="flex items-center justify-between rounded-sm px-4 py-3 text-left text-xs text-muted-foreground hover:bg-background"
                  >
                    <span className="truncate">📢 {latestNotice.title}</span>
                    <ChevronRight size={14} className="shrink-0" />
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="divide-y divide-border">
            {categoryMenu.map((item) => (
              <Link key={item.href} href={item.href} className="flex items-center justify-between py-3 px-4 text-sm">
                <span className="flex items-center gap-2">
                  <item.icon size={18} className="text-muted-foreground" />
                  {item.label}
                </span>
                <ChevronRight size={20} className="text-muted-foreground" />
              </Link>
            ))}
          </div>

          <div className="hidden grid-cols-3 gap-3 md:grid lg:grid-cols-4">
            {categoryMenu.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-2 rounded-lg border border-border p-5 text-center hover:bg-muted"
              >
                <item.icon size={24} className="text-muted-foreground" />
                <span className="text-sm">{item.label}</span>
              </Link>
            ))}
          </div>

          {loggedIn && (
            <LogoutButton className="mt-4 flex items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground md:col-span-2">
              <LogOut size={16} />
              로그아웃
            </LogoutButton>
          )}
        </div>
      </div>

      <div className="md:block">
        <Footer />
      </div>
    </div>
  );
}
