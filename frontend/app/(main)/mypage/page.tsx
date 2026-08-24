// app/(main)/mypage/page.tsx
// ✅ 요청사항 3가지 반영:
//   1. 내 정보 박스에 닉네임(실제 GET /api/consumers/me — API 생기면 자동 채워짐)/등급 표시
//   2. 정기점검 안내(최근 공지)를 저장/최근본/전자영수증 박스에서 분리해서 별도 박스로
//   3. 카테고리를 별도 페이지로 안 보내고, 마이페이지 안에서 그룹 헤더 + 하위 항목으로
//      바로 보여줌 (주문관리/혜택/활동/정보/고객센터)
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Heart,
  Clock,
  Receipt,
  LogOut,
  Award,
} from "lucide-react";
import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/footer";
import { LogoutButton } from "@/components/domain/logout-button";
import { isLoggedIn as checkLoggedIn } from "@/lib/api-client";
import { fetchMyProfile, type ConsumerProfile } from "@/lib/consumer-profile";
import { fetchNotices, type Notice } from "@/lib/notices";

const quickLinks = [
  { href: "/saved", label: "저장", icon: Heart },
  { href: "/mypage/recent", label: "최근 본", icon: Clock },
  { href: "/mypage/receipts", label: "전자영수증", icon: Receipt },
];

// ✅ 그룹으로 "묶기"만 한 것 — 각 그룹은 별도 페이지가 아니라 마이페이지 안 섹션입니다.
const menuGroups = [
  {
    title: "주문 관리",
    items: [
      { href: "/mypage/receipts", label: "전자 영수증" },
      { href: "/mypage/refunds", label: "취소 / 반품 / 환불 내역" },
    ],
  },
  {
    title: "혜택",
    items: [
      { href: "/mypage/tier-guide", label: "등급 안내" },
      { href: "/mypage/points", label: "포인트" },
      { href: "/mypage/coupons", label: "쿠폰" },
    ],
  },
  {
    title: "활동",
    items: [
      { href: "/saved", label: "저장한 리스트" },
      { href: "/mypage/recent", label: "최근 본 상품" },
      { href: "/mypage/notifications", label: "알림 설정" },
    ],
  },
  {
    title: "정보",
    items: [
      { href: "/mypage/account", label: "내 정보" },
      { href: "/mypage/permissions", label: "권한 설정" },
      { href: "/mypage/notices", label: "공지사항" },
      { href: "/mypage/terms", label: "이용약관" },
    ],
  },
  {
    title: "고객센터",
    items: [{ href: "/mypage/support", label: "고객센터" }],
  },
];

export default function MyPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<ConsumerProfile | null>(null);
  const [latestNotice, setLatestNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const isIn = checkLoggedIn();
    setLoggedIn(isIn);
    if (isIn) fetchMyProfile().then(setProfile);
    fetchNotices().then((list) => setLatestNotice(list[0] ?? null));
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <HomeAiHeader />
      <div className="mx-auto w-full flex-1 pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:max-w-4xl md:p-8 md:pb-8">
        <div className="grid gap-6 px-5 md:grid-cols-[280px_1fr] md:items-start">
          <div className="space-y-3">
            {loggedIn ? (
              <>
                {/* 1. 내 정보 박스 — 닉네임 + 등급 */}
                <Link
                  href="/mypage/account"
                  className="my-5 flex items-center justify-between rounded-sm border border-border px-4 py-3"
                >
                  <div>
                    <p className="text-base font-medium">{profile?.name ?? "이름 미입력"}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Award size={12} />
                      등급 안내 보기
                    </p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                </Link>

                {/* 저장/최근본/전자영수증 바로가기 */}
                <div className="grid grid-cols-3 gap-1 rounded-sm bg-muted">
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

                {/* 2. 정기점검 안내(최근 공지) — 위 박스랑 분리 */}
                {latestNotice && (
                  <Link
                    href={`/mypage/notices/${latestNotice.id}`}
                    className="flex items-center justify-between rounded-sm border border-border px-4 py-3 text-left text-sm"
                  >
                    <span className="truncate">📢 {latestNotice.title}</span>
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                  </Link>
                )}
              </>
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
          </div>

          {/* 3. 그룹 헤더 + 하위 항목을 마이페이지 안에서 바로 */}
          <div className="space-y-6">
            {menuGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-1 px-4 text-xs font-semibold text-muted-foreground">{group.title}</p>
                <div className="divide-y divide-border">
                  {group.items.map((item) => (
                    <Link key={item.href} href={item.href} className="flex items-center justify-between py-3 px-4 text-sm">
                      {item.label}
                      <ChevronRight size={18} className="text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {loggedIn && (
            <LogoutButton className="mt-2 flex items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground md:col-span-2">
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
