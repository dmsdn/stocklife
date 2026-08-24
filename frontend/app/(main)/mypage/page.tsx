// app/(main)/mypage/page.tsx
// ✅ 화면 꽉 차게(모바일은 하단탭바 높이만큼 하단 여백).
//    포인트·쿠폰을 한 줄로 합치고,
//    "리뷰" 자리엔 저장/최근본/전자영수증 바로가기 3개.
//    구매내역은 전자영수증으로 흡수.
//    포인트·쿠폰은 각각 상세 페이지로 이동합니다.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Receipt,
  RotateCcw,
  Award,
  Megaphone,
  Bell,
  FileText,
  HelpCircle,
  Heart,
  Clock,
} from "lucide-react";
import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/footer";
import { isLoggedIn as checkLoggedIn } from "@/lib/api-client";

// ⚠ 구매내역·전자영수증이 사실상 같은 내용이라 "전자 영수증" 하나로 합쳤습니다.
const memberOnlyMenuItems = [
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

const quickLinks = [
  { href: "/saved", label: "저장", icon: Heart },
  { href: "/mypage/recent", label: "최근 본", icon: Clock },
  { href: "/mypage/receipts", label: "전자영수증", icon: Receipt },
];

export default function MyPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  // TODO: 추후 백엔드 API 연동
  const stats = {
    point: 1000,
    coupon: 21,
  };

  useEffect(() => {
    setLoggedIn(checkLoggedIn());
  }, []);

  const menuItems = loggedIn
    ? [...memberOnlyMenuItems, ...commonMenuItems]
    : commonMenuItems;

  return (
    <div className="flex min-h-full flex-col">
      <HomeAiHeader />
      <div className="mx-auto w-full flex-1 pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:max-w-4xl md:p-8 md:pb-8">
        <div className="grid gap-6 md:grid-cols-[280px_1fr] md:items-start px-5">
          <div className="text-center text-sm font-medium">
            {loggedIn ? (
              <div className="space-y-3 my-5 px-3 border border-border rounded-sm">
                <div className="flex items-center gap-3 py-3 m-0">
                  <Link
                    href="/mypage/account"
                    className="flex flex-1 items-center gap-3"
                  >
                    <div className="h-14 w-14 shrink-0 rounded-full bg-muted" />

                    <div>
                      <p className="text-sm text-muted-foreground">등급</p>
                      <p className="text-base">닉네임</p>
                    </div>
                  </Link>

                  <ChevronRight
                    size={18}
                    className="shrink-0 text-muted-foreground"
                  />
                </div>
                <hr className="m-0" />

                {/* 포인트 / 쿠폰 */}
                <div className="grid grid-cols-2 text-xs text-muted-foreground hover:bg-background hover:text-foreground">
                  <Link
                    href="/mypage/points"
                    className="items-center justify-center rounded-sm py-3 text-sm hover:bg-muted"
                  >
                    <span className="text-xs text-muted-foreground">
                      포인트 
                    </span>
                    <span className="mt-1 text-base font-medium ">
                      {stats.point.toLocaleString()}P
                    </span>
                  </Link>

                  <Link
                    href="/mypage/coupons"
                    className="items-center justify-center rounded-sm py-3 text-sm hover:bg-muted"
                  >
                    <span className="text-xs text-muted-foreground">
                      쿠폰 
                    </span>
                    <span className="mt-1 text-base font-medium ">
                      {stats.coupon}개
                    </span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-lg font-medium">
                  회원가입 하고 이용해보세요
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <Link href="/auth/login">
                    <Button variant="outline" className="w-full">
                      로그인
                    </Button>
                  </Link>

                  <Link href="/auth/signup/terms">
                    <Button className="w-full">
                      회원가입
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {loggedIn && (
              <>
                <div className="space-y-3 rounded-sm bg-muted">
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
                </div>
              </>
            )}
          </div>

          <div className="divide-y divide-border ">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between py-3 px-4 text-sm"
              >
                {item.label}

                <ChevronRight
                  size={24}
                  className="text-muted-foreground"
                />
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
                <item.icon
                  size={24}
                  className="text-muted-foreground"
                />

                <span className="text-sm">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="md:block">
        <Footer />
      </div>
    </div>
  );
}