"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { RiMessage3Line, RiBookmarkLine } from "@remixicon/react";

import { apiFetch, getAccessToken } from "@/lib/api-client";
import { LoginRequiredDialog } from "@/components/domain/login-required-dialog";

export interface DashboardChatSession {
  sessionId: string;
  title: string | null;
  updatedAt: string;
}

interface HomeDashboardProps {
  onChatClick: () => void;
  onWishlistClick: () => void;
  recentSession: DashboardChatSession | null;
  /** null = 로그인 전, 0 이상 = 로그인 후 실제 개수 */
  wishlistCount: number | null;
}

// ✅ 홈 리디자인(2026-08, Stocklife 전면 재설계) — Hero Card가 "담은 리스트" 역할을
//   전담하게 되면서 이 컴포넌트는 Hero Card가 다루지 않는 나머지 바로가기(찜/AI대화)만
//   남겼습니다. "자주 구매하는 상품"은 WhatToBuy의 "자주 사요" 탭이 이미지·가격까지 갖춘
//   상품카드로 더 잘 보여주게 돼서 여기서는 뺐고, "최근 검색어"는 검색바(HomeSearch) 쪽으로
//   옮겼습니다. "자주 사는 카테고리"는 대체할 곳이 마땅치 않은 고유 기능이라 그대로 유지.
export function HomeDashboard({
  onChatClick,
  onWishlistClick,
  recentSession,
  wishlistCount,
}: HomeDashboardProps) {
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [topCategories, setTopCategories] = useState<{ categoryL2: string; purchaseCount: number }[]>([]);

  useEffect(() => {
    if (getAccessToken()) {
      apiFetch<{ categoryL2: string; purchaseCount: number }[]>("/api/purchases/top-categories?limit=5")
        .then(setTopCategories)
        .catch(() => setTopCategories([]));
    }
  }, []);

  const guardedClick = (needsLogin: boolean, action: () => void) => () => {
    if (needsLogin) {
      setLoginDialogOpen(true);
      return;
    }
    action();
  };

  const shortcuts = [
    {
      key: "wishlist",
      icon: RiBookmarkLine,
      label: "찜한 상품",
      caption: wishlistCount !== null ? (wishlistCount > 0 ? `${wishlistCount}개` : "없음") : "로그인 필요",
      onClick: guardedClick(wishlistCount === null, onWishlistClick),
    },
    {
      key: "chat",
      icon: RiMessage3Line,
      label: recentSession ? "AI 대화 이어하기" : "AI에게 물어보기",
      caption: recentSession?.title ?? "새로운 대화",
      onClick: onChatClick,
    },
  ];

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-3">
        {shortcuts.map(({ key, icon: Icon, label, caption, onClick }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            className="flex items-center gap-2.5 rounded-lg bg-card px-4 py-4 text-left ring-1 ring-foreground/10 hover:bg-accent"
          >
            <Icon size={24} className="shrink-0 text-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{label}</span>
              <span className="block truncate text-xs text-muted-foreground">{caption}</span>
            </span>
          </button>
        ))}
      </div>

      {topCategories.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">자주 사는 카테고리</span>
          {topCategories.map((c) => (
            <Link
              key={c.categoryL2}
              href={`/search?keyword=${encodeURIComponent(c.categoryL2)}`}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            >
              {c.categoryL2} {c.purchaseCount}회
            </Link>
          ))}
        </div>
      )}

      <LoginRequiredDialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} />
    </section>
  );
}
