// app/(main)/mypage/page.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Heart,
  Clock,
  Receipt,
  LogOut,
} from "lucide-react";

import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { Footer } from "@/components/layout/footer";
import { LogoutButton } from "@/components/domain/logout-button";
import { Button } from "@/components/ui/button";

import { isLoggedIn as checkLoggedIn } from "@/lib/api-client";
import {
  getMyProfile,
  type ConsumerMe,
} from "@/lib/consumer-api";
import { GradeBox } from "@/components/domain/grade-box";

import {
  fetchNotices,
  type Notice,
} from "@/lib/notices";

const quickLinks = [
  {
    href: "/saved",
    label: "저장",
    icon: Heart,
  },
  {
    href: "/mypage/recent",
    label: "최근 본",
    icon: Clock,
  },
  {
    href: "/mypage/receipts",
    label: "전자영수증",
    icon: Receipt,
  },
];

const menuGroups = [
  {
    title: "쇼핑",
    items: [
      {
        href: "/mypage/orders",
        label: "구매내역",
      },
      {
        href: "/mypage/refunds",
        label: "교환/반품/환불 내역",
      },
    ],
  },
  {
    title: "혜택",
    items: [
      {
        href: "/mypage/tier-guide",
        label: "멤버십 등급",
      },
      {
        href: "/mypage/points",
        label: "포인트",
      },
      {
        href: "/mypage/coupons",
        label: "쿠폰",
      },
    ],
  },
  {
    title: "활동",
    items: [
      {
        href: "/mypage/account",
        label: "회원정보",
      },
      {
        href: "/saved",
        label: "저장한 리스트",
      },
      {
        href: "/mypage/recent",
        label: "최근 본 상품",
      },
      {
        href: "/mypage/frequent",
        label: "자주 구매한 상품",
      },
    ],
  },
  {
    title: "설정",
    items: [
      {
        href: "/mypage/permissions",
        label: "권한 설정",
      },
      {
        href: "/mypage/notifications",
        label: "알림 설정",
      },
    ],
  },
  {
    title: "알림센터",
    items: [
      {
        href: "/mypage/notifications/inbox",
        label: "알림함",
      },
    ],
  },
  {
    title: "고객지원",
    items: [
      {
        href: "/mypage/notices",
        label: "공지사항",
      },
      {
        href: "/mypage/faq",
        label: "FAQ",
      },
      {
        href: "/mypage/support",
        label: "고객센터",
      },
      {
        href: "/mypage/terms",
        label: "이용약관",
      },
    ],
  },
];

export default function MyPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<ConsumerMe | null>(null);
  const [latestNotice, setLatestNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const isIn = checkLoggedIn();

    setLoggedIn(isIn);

    if (isIn) {
      getMyProfile().then(setProfile).catch(() => setProfile(null));
    }

    fetchNotices().then((list) => {
      setLatestNotice(list[0] ?? null);
    });
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <HomeAiHeader />

      <main className="mx-auto w-full flex-1 pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:max-w-4xl md:p-8 md:pb-8">
        <div className="px-0">

          {/* =========================
              사용자 이름 + 멤버십 등급
             ========================= */}

          {loggedIn ? (
            <Link
              href="/mypage/account"
              className="
                flex
                items-center
                justify-between
                px-5
                py-4
                text-sm
                font-medium
                transition-colors
                hover:bg-muted/50
              "
            >
              <div className="flex items-center gap-2">
                <span>
                  {profile?.name ?? "이름 미입력"}
                </span>
              </div>

              <ChevronRight
                size={18}
                className="shrink-0 text-muted-foreground"
              />
            </Link>
          ) : (
            <div className="px-5 py-4">
              <p className="text-base font-medium">
                회원가입 하고 이용해보세요
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/auth/login" className="w-full">
                  <Button variant="outline" className="w-full">
                    로그인
                  </Button>
                </Link>

                <Link href="/auth/signup/terms" className="w-full">
                  <Button className="w-full">
                    회원가입
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* =========================
              멤버십
             ========================= */}

          {/* ✅ 정적 "멤버십" 링크 박스 대신, 내 정보 화면과 같은 실제 등급 박스(GradeBox)를 씁니다. */}
          <div className="mt-1">
            <GradeBox profile={profile} />
          </div>

          {/* =========================
              저장 / 최근 본 / 전자영수증
              기존 코드의 quickLinks 유지
             ========================= */}

          <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-[20px] bg-muted">
            {quickLinks.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="
                  flex
                  flex-col
                  items-center
                  justify-center
                  gap-1
                  rounded-[20px]
                  py-6
                  text-xs
                  text-muted-foreground
                  transition-colors
                  hover:bg-background
                  hover:text-foreground
                "
              >
                <q.icon size={18} />
                {q.label}
              </Link>
            ))}
          </div>

          {/* =========================
              공지
              기존 latestNotice 로직 유지
             ========================= */}

          {latestNotice && (
            <Link
              href={`/mypage/notices/${latestNotice.id}`}
              className="
                mt-2.5
                flex
                h-[34px]
                items-center
                justify-center
                overflow-hidden
                rounded-[17px]
                bg-muted
                px-4
                text-left
                text-sm
              "
            >
              <span className="truncate">
                📢 {latestNotice.title}
              </span>
            </Link>
          )}

          {/* =========================
              메뉴 그룹
             ========================= */}

          <div className="mt-8 space-y-7">
            {menuGroups.map((group) => (
              <section key={group.title}>
                <p className="mb-1 px-5 text-xs font-semibold text-muted-foreground">
                  {group.title}
                </p>

                <div className="divide-y divide-border">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="
                        flex
                        items-center
                        justify-between
                        px-5
                        py-3
                        text-sm
                        transition-colors
                        hover:bg-muted/50
                      "
                    >
                      <span>{item.label}</span>

                      <ChevronRight
                        size={18}
                        className="shrink-0 text-muted-foreground"
                      />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* =========================
              로그아웃
             ========================= */}

          {loggedIn && (
            <LogoutButton
              className="
                mt-8
                flex
                w-full
                items-center
                justify-center
                gap-1.5
                py-4
                text-sm
                text-muted-foreground
              "
            >
              <LogOut size={16} />
              로그아웃
            </LogoutButton>
          )}
        </div>
      </main>

      {/* =========================
          Footer
         ========================= */}

      <Footer />
    </div>
  );
}