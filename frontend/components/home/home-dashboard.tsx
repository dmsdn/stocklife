"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Award,
  ShoppingCart,
  MessageSquare,
  Bookmark,
  Receipt,
  ChevronRight,
} from "lucide-react";

import { GRADE_TIERS } from "@/lib/grade";
import { readSearchHistory } from "@/lib/search-history";
import { apiFetch, getAccessToken } from "@/lib/api-client";
import type { RecentOrderSummary } from "@/lib/home-data";
import { LoginRequiredDialog } from "@/components/domain/login-required-dialog";
import { SectionTitle } from "./section-title";

export interface DashboardChatSession {
  sessionId: string;
  title: string | null;
  updatedAt: string;
}

interface HomeDashboardProps {
  onGradeClick: () => void;
  onCartClick: () => void;
  onChatClick: () => void;
  onOrdersClick: () => void;
  onWishlistClick: () => void;
  cartItemCount: number;
  cartEstimatedPrice: number;
  recentSession: DashboardChatSession | null;
  /** null = 로그인 전(개인정보라 조회 자체를 안 함) */
  recentOrder: RecentOrderSummary | null;
  /** null = 로그인 전, 0 이상 = 로그인 후 실제 개수 */
  wishlistCount: number | null;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "결제 대기",
  PAID: "결제 완료",
  PREPARING: "상품 준비 중",
  SHIPPED: "배송 중",
  DELIVERED: "배송 완료",
  CANCELLED: "취소됨",
};

// ✅ "내 쇼핑"인데 정작 내 정보가 하나도 없던 문제를 고쳤습니다. 전부 실제 데이터입니다:
//   - 담은 리스트: lib/cart-storage.ts (실제 로컬 저장 데이터)
//   - 최근 주문: GET /api/orders (실제 백엔드, 로그인 전이면 조회 안 하고 로그인 유도)
//   - 찜한 상품: GET /api/wishlist (실제 백엔드, 위와 동일)
//   - 최근 AI 대화: GET /api/chat/sessions (실제 백엔드)
//   - 등급: 백엔드 Grade enum(lib/grade.ts) 체계 안내 — 진행률 조회 API가 없어 소개만
//   검색/저장/스캔/AI챗 바로가기 아이콘은 하단 탭바와 완전히 중복이라 들어냈고,
//   최근 검색어만 실제로 다시 찾아볼 확률이 높아서 남겨뒀습니다.
export function HomeDashboard({
  onGradeClick,
  onCartClick,
  onChatClick,
  onOrdersClick,
  onWishlistClick,
  cartItemCount,
  cartEstimatedPrice,
  recentSession,
  recentOrder,
  wishlistCount,
}: HomeDashboardProps) {
  const recentSearches = readSearchHistory().slice(0, 5);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [topCategories, setTopCategories] = useState<{ categoryL2: string; purchaseCount: number }[]>([]);
  const [frequentPurchases, setFrequentPurchases] = useState<{ skuId: number; productName: string; purchaseCount: number }[]>([]);

  useEffect(() => {
    if (getAccessToken()) {
      apiFetch<{ categoryL2: string; purchaseCount: number }[]>("/api/purchases/top-categories?limit=5")
        .then(setTopCategories)
        .catch(() => setTopCategories([]));

      // ✅ 실제 GET /api/orders/frequent 연동
      apiFetch<{ skuId: number; productName: string; purchaseCount: number }[]>("/api/orders/frequent")
        .then((list) => setFrequentPurchases(list.slice(0, 5)))
        .catch(() => setFrequentPurchases([]));
    }
  }, []);

  const guardedClick = (needsLogin: boolean, action: () => void) => () => {
    if (needsLogin) {
      setLoginDialogOpen(true);
      return;
    }
    action();
  };

  return (
    <section className="w-full px-4 pt-7 sm:px-6 lg:px-8">
      <SectionTitle title="마이 쇼핑" />

      {frequentPurchases.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-sm font-semibold">자주 구매하는 상품</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {frequentPurchases.map((p) => (
              <Link
                key={p.skuId}
                href={`/search?keyword=${encodeURIComponent(p.productName)}`}
                className="flex shrink-0 flex-col gap-1 rounded-sm border border-border px-3 py-2.5"
              >
                <span className="text-sm">{p.productName}</span>
                <span className="text-xs text-muted-foreground">{p.purchaseCount}번 구매</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* 담은 리스트 — 가장 이어서 하기 쉬운 것 먼저 */}
        <button
          type="button"
          onClick={onCartClick}
          className="flex items-center gap-3 rounded-sm border border-border p-4 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-muted">
            <ShoppingCart size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">담은 리스트</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {cartItemCount > 0
                ? `상품 ${cartItemCount}개 · 예상 ${cartEstimatedPrice.toLocaleString()}원`
                : "아직 담은 상품이 없어요"}
            </p>
          </div>
        </button>

        {/* 최근 주문 — 실제 GET /api/orders */}
        <button
          type="button"
          onClick={guardedClick(recentOrder === null, onOrdersClick)}
          className="flex items-center gap-3 rounded-sm border border-border p-4 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-muted">
            <Receipt size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">최근 주문</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {recentOrder
                ? `${ORDER_STATUS_LABEL[recentOrder.status] ?? recentOrder.status} · ${recentOrder.totalAmount.toLocaleString()}원`
                : "로그인하고 주문내역을 확인해보세요"}
            </p>
          </div>
        </button>

        {/* 찜한 상품 — 실제 GET /api/wishlist */}
        <button
          type="button"
          onClick={guardedClick(wishlistCount === null, onWishlistClick)}
          className="flex items-center gap-3 rounded-sm border border-border p-4 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-muted">
            <Bookmark size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">찜한 상품</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {wishlistCount !== null
                ? wishlistCount > 0
                  ? `${wishlistCount}개 찜해뒀어요`
                  : "아직 찜한 상품이 없어요"
                : "로그인하고 찜 목록을 확인해보세요"}
            </p>
          </div>
        </button>

        {/* 최근 AI 대화 — 이어서 물어볼 수 있게 */}
        <button
          type="button"
          onClick={onChatClick}
          className="flex items-center gap-3 rounded-sm border border-border p-4 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-muted">
            <MessageSquare size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {recentSession ? "최근 AI 대화 이어하기" : "AI에게 물어보기"}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {recentSession?.title ?? "아직 나눈 대화가 없어요"}
            </p>
          </div>
        </button>
      </div>

      {/* 등급 — 진행률은 조회 API가 없어서 체계 소개 정도로 */}
      <button
        type="button"
        onClick={onGradeClick}
        className="mt-3 flex w-full items-center gap-3 rounded-sm border border-border p-4 text-left"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Award size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">등급 안내</p>
          <div className="mt-1.5 flex gap-1.5 overflow-x-auto scrollbar-hide">
            {GRADE_TIERS.map((tier) => (
              <span
                key={tier.key}
                className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {tier.label}
              </span>
            ))}
          </div>
        </div>
        <ChevronRight size={24} className="shrink-0 text-muted-foreground" />
      </button>

      {/* ✅ 실제 구매이력 기반 자주 사는 카테고리 (GET /api/purchases/top-categories) */}
      {topCategories.length > 0 && (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
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

      {/* 최근 검색어 — 있을 때만 */}
      {recentSearches.length > 0 && (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <span className="shrink-0 text-xs text-muted-foreground">최근 검색</span>
          {recentSearches.map((word) => (
            <Link
              key={word}
              href={`/search?keyword=${encodeURIComponent(word)}`}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            >
              {word}
            </Link>
          ))}
        </div>
      )}

      <LoginRequiredDialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} />
    </section>
  );
}
