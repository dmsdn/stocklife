"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { SwipeNav } from "@/components/layout/swipe-nav";
import { useOpenAiChat } from "@/lib/use-open-ai-chat";

import {
  addProductToCartGroup,
  createCartGroup,
  readCartGroups,
  type CartGroup,
} from "@/lib/cart-storage";

import {
  fetchRecommendedProducts,
  fetchRecentOrder,
  fetchWishlistCount,
  type RecommendedProduct,
  type RecentOrderSummary,
} from "@/lib/home-data";

import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { Footer } from "@/components/layout/footer";

import { HomeSearch } from "@/components/home/search";
import { HomeDashboard, type DashboardChatSession } from "@/components/home/home-dashboard";
import { AiGuide } from "@/components/home/ai-guide";
import { RecommendedProducts } from "@/components/home/recommended-products";
import { AiDiscovered } from "@/components/home/ai-discovered";
import { Discover } from "@/components/home/discover";
import { CartPicker } from "@/components/home/cart-picker";
import { apiFetch, getAccessToken } from "@/lib/api-client";
import { getClientId } from "@/lib/client-id";

function chatHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

export default function HomePage() {
  const router = useRouter();

  // ✅ AI챗을 여는 방법이 두 갈래(전역 패널 vs 이 페이지만의 로컬 Dialog)로 나뉘어 있던 게
  //   "모바일↔웹 전환 시 AI챗이 중복으로 뜨는" 버그의 원인이었습니다. 이제 하나로 통일.
  const openAiChat = useOpenAiChat();

  const [cartPickerOpen, setCartPickerOpen] =
    useState(false);

  const [selectedProduct, setSelectedProduct] =
    useState<RecommendedProduct | null>(null);

  const [cartGroups, setCartGroups] =
    useState<CartGroup[]>([]);

  const [recentSession, setRecentSession] =
    useState<DashboardChatSession | null>(null);

  // ✅ "마이 쇼핑" 카드용 실제 개인 데이터. null = 로그인 전(개인정보라 조회 자체를 안 함).
  const [recentOrder, setRecentOrder] =
    useState<RecentOrderSummary | null>(null);

  const [wishlistCount, setWishlistCount] =
    useState<number | null>(null);

  // ✅ 실제 DB(GET /api/products/search) 연동. 실패하거나 결과가 없으면
  //   home-data.ts 안의 목업(실제 카탈로그와 같은 형태)으로 자동 대체됩니다.
  const [recommendedProducts, setRecommendedProducts] =
    useState<RecommendedProduct[]>([]);

  useEffect(() => {
    fetchRecommendedProducts().then(setRecommendedProducts);
  }, []);

  useEffect(() => {
    setCartGroups(readCartGroups());
  }, []);

  // ✅ 최근 AI 대화 — 실제 GET /api/chat/sessions
  useEffect(() => {
    apiFetch<DashboardChatSession[]>("/api/chat/sessions", { headers: chatHeaders() })
      .then((list) => setRecentSession(list[0] ?? null))
      .catch(() => setRecentSession(null));
  }, []);

  // ✅ 최근 주문 / 찜한 상품 — 실제 GET /api/orders, GET /api/wishlist
  useEffect(() => {
    fetchRecentOrder().then(setRecentOrder);
    fetchWishlistCount().then(setWishlistCount);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const previousHtmlOverflowX =
      html.style.overflowX;

    const previousBodyOverflowX =
      body.style.overflowX;

    html.style.overflowX = "hidden";
    body.style.overflowX = "hidden";

    return () => {
      html.style.overflowX =
        previousHtmlOverflowX;

      body.style.overflowX =
        previousBodyOverflowX;
    };
  }, []);

  // ✅ 담은 리스트(lib/cart-storage.ts) 기준 실제 합계 — HomeDashboard 카드에 그대로 연결
  const cartTotals = useMemo(() => {
    const allProducts = cartGroups.flatMap((g) => g.products);
    const itemCount = allProducts.length;
    const estimatedPrice = allProducts.reduce((sum, p) => sum + p.price * p.quantity, 0);
    return { itemCount, estimatedPrice };
  }, [cartGroups]);

  const goSearch = () => {
    router.push("/search");
  };

  const goProduct = (
    productId: number,
  ) => {
    router.push(
      `/search?productId=${productId}`,
    );
  };

  const openCartPicker = (
    product: RecommendedProduct,
  ) => {
    setSelectedProduct(product);
    setCartGroups(readCartGroups());
    setCartPickerOpen(true);
  };

  const closeCartPicker = () => {
    setCartPickerOpen(false);
    setSelectedProduct(null);
  };

  const handleAddToCart = (
    groupId: number,
  ) => {
    if (!selectedProduct) {
      return;
    }

    const nextGroups =
      addProductToCartGroup(
        groupId,
        {
          id: selectedProduct.id,
          name: selectedProduct.name,
          category: selectedProduct.category,
          price: selectedProduct.price,
          image: selectedProduct.image,
        },
      );

    setCartGroups(nextGroups);
    closeCartPicker();
  };

  const handleCreateCart = () => {
    if (!selectedProduct) {
      return;
    }

    const newGroup =
      createCartGroup("새 장보기");

    const nextGroups =
      addProductToCartGroup(
        newGroup.id,
        {
          id: selectedProduct.id,
          name: selectedProduct.name,
          category: selectedProduct.category,
          price: selectedProduct.price,
          image: selectedProduct.image,
        },
      );

    setCartGroups(nextGroups);
    closeCartPicker();
  };

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-hidden bg-background">
      <HomeAiHeader />
      <SwipeNav current={0}>
        <main className="w-[min(100%,100vw)] max-w-[100vw] min-w-0 overflow-x-hidden pb-28">
          <div className="w-full min-w-0">
            <HomeSearch onClick={goSearch} />

            {/* ✅ 예전 "나의 등급" 카드 하나뿐이던 걸, 자주 쓰는 것들(담은 리스트/최근 AI 대화/
                등급/최근 검색어/바로가기)을 한 번에 볼 수 있는 대시보드로 교체했습니다. */}
            <HomeDashboard
              onGradeClick={() => router.push("/mypage/tier-guide")}
              onCartClick={() => router.push("/saved")}
              onChatClick={() =>
                recentSession ? router.push(`/ai?session=${recentSession.sessionId}`) : openAiChat()
              }
              onOrdersClick={() => router.push("/mypage/orders")}
              onWishlistClick={() => router.push("/mypage/wishlist")}
              cartItemCount={cartTotals.itemCount}
              cartEstimatedPrice={cartTotals.estimatedPrice}
              recentSession={recentSession}
              recentOrder={recentOrder}
              wishlistCount={wishlistCount}
            />

            <AiGuide
              onSelectPrompt={openAiChat}
            />

            <RecommendedProducts
              products={recommendedProducts}
              onProductClick={goProduct}
              onSave={openCartPicker}
              onMore={goSearch}
            />

            <AiDiscovered
              onProductClick={goProduct}
            />

            <Discover
              onProductClick={goProduct}
            />
            
            <div className="h-8" />

          <Footer />
            
          </div>
        </main>
      </SwipeNav>

      <CartPicker
        open={cartPickerOpen}
        selectedProduct={selectedProduct}
        cartGroups={cartGroups}
        onClose={closeCartPicker}
        onAddToCart={handleAddToCart}
        onCreateCart={handleCreateCart}
      />
      
    </div>
  );
}