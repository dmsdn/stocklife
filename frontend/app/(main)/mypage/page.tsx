// app/(main)/mypage/page.tsx
// ✅ Figma "애지중지_storyboard" Frame 124(로그인 전) / Frame 125(로그인 후) 픽셀 값 그대로 이식.
//   프로젝트 시맨틱 토큰(border-border 등)이 Figma 색상과 실제로 달라서, 1차로는 토큰 대신
//   Figma 값(#f8f8f8, #eee, #f7ded4/#ffc9b4/#ee4908, #f2f2f2/#e9e9e9, #999)을 그대로 하드코딩.
//   ⚠ 아직 반응형 아님 — Figma 360px 캔버스 기준 고정값. 확인 후 md: 브레이크포인트 추가 예정.
//   ⚠ 등급 배지 아이콘(Figma의 Intersect+B 합성 이미지)은 전용 에셋이라 원형 배지로 단순화함.
//   ⚠ 등급 카드 텍스트는 Figma 목업의 영어 "Basic" 대신 실제 데이터(lib/grade.ts GRADE_TIERS)의
//     한글 라벨을 사용 — 목업 텍스트를 그대로 박으면 실제 데이터와 어긋나기 때문.
//
//   [업데이트] get_design_context로 Frame 124/125 실측값을 다시 대조해서 4곳 수정:
//   1) 저장/최근본/전자영수증 박스 높이 h-[75px] 고정 (Figma 실측)
//   2) 멤버십 등급 카드 내부 padding/간격을 Figma 좌표에 맞춤 (px-5 pt-4 pb-5, 줄 간격 mt-2)
//   3) 공지 배너 텍스트 색 #111 → text-black (Figma 원본 색상)
//   4) 메뉴 그룹 리스트: 화면 끝까지 풀블리드 + 행마다 px-[30px] (Figma는 20px 인셋이 아니라
//      30px 인셋이라 -mx-5로 부모 패딩을 상쇄), 텍스트 색 #111 → text-black

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RiArrowRightSLine,
  RiBookmarkLine,
  RiHistoryLine,
  RiReceiptLine,
  RiLogoutBoxLine,
  RiMegaphoneLine,
} from "@remixicon/react";

import { Footer } from "@/components/layout/footer";
import { LogoutButton } from "@/components/domain/logout-button";

import { isLoggedIn as checkLoggedIn } from "@/lib/api-client";
import { getMyProfile, type ConsumerMe } from "@/lib/consumer-api";
import { GRADE_TIERS, gradeIconSrc, gradeColor } from "@/lib/grade";
import { fetchNotices, type Notice } from "@/lib/notices";

const quickLinks = [
  {
    href: "/saved",
    label: "저장",
    icon: RiBookmarkLine,
  },
  {
    href: "/mypage/recent",
    label: "최근 본",
    icon: RiHistoryLine,
  },
  {
    href: "/mypage/receipts",
    label: "전자영수증",
    icon: RiReceiptLine,
  },
];

const menuGroups = [
  {
    title: "쇼핑",
    loggedInOnly: true,
    items: [
      { href: "/mypage/orders", label: "구매내역" },
      { href: "/mypage/refunds", label: "교환/반품/환불 내역" },
      { href: "/mypage/spending", label: "소비 분석" },
    ],
  },
  {
    title: "혜택",
    items: [
      { href: "/mypage/tier-guide", label: "멤버십 등급" },
      { href: "/mypage/points", label: "포인트" },
      { href: "/mypage/coupons", label: "쿠폰" },
    ],
  },
  {
    title: "활동",
    loggedInOnly: true,
    items: [
      { href: "/mypage/account", label: "회원정보" },
      { href: "/saved", label: "저장한 리스트" },
      { href: "/mypage/recent", label: "최근 본 상품" },
      { href: "/mypage/frequent", label: "자주 구매한 상품" },
    ],
  },
  {
    title: "설정",
    items: [
      { href: "/mypage/permissions", label: "권한 설정" },
      { href: "/mypage/notifications", label: "알림 설정" },
    ],
  },
  {
    title: "알림센터",
    items: [{ href: "/mypage/notifications/inbox", label: "알림함" }],
  },
  {
    title: "고객지원",
    items: [
      { href: "/mypage/notices", label: "공지사항" },
      { href: "/mypage/faq", label: "FAQ" },
      { href: "/mypage/support", label: "고객센터" },
      { href: "/mypage/terms", label: "이용약관" },
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

  // 등급 카드 계산 — GradeBox(components/domain/grade-box.tsx)와 같은 로직.
  // 이 화면은 Figma 스타일 전용이라 별도로 계산 (공용 GradeBox는 다른 화면 스타일을 유지).
  const currentTierIndex = profile ? Math.max(GRADE_TIERS.findIndex((t) => t.key === profile.grade), 0) : 0;
  const currentTier = GRADE_TIERS[currentTierIndex];
  const nextTier = GRADE_TIERS[currentTierIndex + 1];
  const progressPercent =
    profile && nextTier
      ? Math.min(
          100,
          Math.max(
            0,
            ((profile.pointEarnedTotal - currentTier.threshold) / (nextTier.threshold - currentTier.threshold)) * 100
          )
        )
      : 0;

  return (
    <div className="flex min-h-full flex-col bg-surface-subtle">
      {/* ✅ 신규 — Figma엔 있는데 기존 코드엔 없던 "마이페이지" 타이틀 바 */}
      <div className="flex h-14 w-full items-center px-5">
        <p className="text-[16px] font-medium leading-[1.6] text-[#111]">마이페이지</p>
      </div>

      <main className="mx-auto w-full flex-1 pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)]">
        <div className="px-5">
          {/* =========================
              사용자 이름 + 로그인 유도
             ========================= */}

          {loggedIn ? (
            <Link href="/mypage/account" className="block py-4">
              <p className="text-[20px] font-semibold leading-[1.6] text-[#111]">
                {profile?.name ?? "이름 미입력"}
              </p>
            </Link>
          ) : (
            <div className="py-4">
              <p className="text-[20px] font-semibold leading-[1.6] text-[#111]">
                로그인 하고
                <br />
                더 많은 서비스를 이용해보세요
              </p>

              <div className="mt-4 flex gap-[6px]">
                <Link href="/auth/login" className="flex-1">
                  <span className="flex h-[48px] w-full items-center justify-center rounded-[50px] border border-card-border bg-white text-[16px] font-medium text-[#111]">
                    로그인하기
                  </span>
                </Link>

                <Link href="/auth/signup/terms" className="flex-1">
                  <span className="flex h-[48px] w-full items-center justify-center rounded-[50px] border border-[#ffc9b4] bg-[#f7ded4] text-[16px] font-medium text-main">
                    회원가입
                  </span>
                </Link>
              </div>
            </div>
          )}

          {/* =========================
              멤버십 등급 카드 (로그인 시에만, Figma "Basic" 카드 스타일)
             ========================= */}

          {loggedIn && profile && (
            <div className="mt-3 rounded-[20px] border border-card-border bg-white px-5 pt-4 pb-5">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gradeIconSrc(currentTier.key)} alt="" className="h-6 w-6 shrink-0" />
                <p className="text-[14px] font-semibold text-[#111]">{currentTier.label}</p>
              </div>

              <div className="mt-2 h-[6px] w-full rounded-[10px] bg-card-border">
                <div
                  className="h-full rounded-[10px]"
                  style={{ width: `${nextTier ? progressPercent : 100}%`, backgroundColor: gradeColor(currentTier.key) }}
                />
              </div>

              <p className="mt-2 text-[13px] text-content-tertiary">
                {nextTier
                  ? `${nextTier.label} 등급까지 ${(nextTier.threshold - profile.pointEarnedTotal).toLocaleString()} P 남았습니다.`
                  : "가장 높은 등급이에요."}
              </p>
            </div>
          )}

          {/* =========================
              저장 / 최근 본 / 전자영수증
             ========================= */}

          <div className="mt-3 flex h-[75px] items-center justify-around rounded-[20px] border border-card-border bg-white">
            {quickLinks.map((q) => (
              <Link key={q.href} href={q.href} className="flex flex-col items-center gap-2">
                <q.icon size={24} className="text-[#111]" />
                <span className="text-[14px] font-light text-[#111]">{q.label}</span>
              </Link>
            ))}
          </div>

          {/* =========================
              공지
             ========================= */}

          {latestNotice && (
            <Link
              href={`/mypage/notices/${latestNotice.id}`}
              className="mt-3 flex h-10 items-center gap-2 overflow-hidden rounded-[20px] border border-card-border bg-surface-subtle px-4"
            >
              <RiMegaphoneLine size={16} className="shrink-0 text-[#111]" />
              <span className="truncate text-[14px] text-black">
                <span className="font-semibold">[ 공지 ] </span>
                {latestNotice.title}
              </span>
            </Link>
          )}

          {/* =========================
              메뉴 그룹
             ========================= */}

          <div className="mt-8 space-y-7">
            {menuGroups
              .filter((group) => loggedIn || !group.loggedInOnly)
              .map((group) => (
                <section key={group.title}>
                  <p className="mb-1 text-[13px] text-content-tertiary">{group.title}</p>

                  <div className="-mx-5">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center justify-between px-[30px] py-[15px] text-[15px] text-black"
                      >
                        <span>{item.label}</span>
                        <RiArrowRightSLine size={18} className="shrink-0 text-content-tertiary" />
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
            <LogoutButton className="mt-8 flex w-full items-center justify-center gap-1.5 py-4 text-[14px] text-content-tertiary">
              <RiLogoutBoxLine size={20} />
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
