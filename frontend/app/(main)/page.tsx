"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { SwipeNav } from "@/components/layout/swipe-nav";
import { AiChatPanel } from "@/components/ai/ai-chat-panel";

import {
  addProductToCartGroup,
  createCartGroup,
  readCartGroups,
  type CartGroup,
} from "@/lib/cart-storage";

import {
  recommendedProducts,
  type RecommendedProduct,
} from "@/lib/home-data";

import { HomeSearch } from "@/components/home/search";
import { ShoppingStatus } from "@/components/home/shopping-status";
import { AiGuide } from "@/components/home/ai-guide";
import { TodayBriefing } from "@/components/home/today-briefing";
import { RecommendedProducts } from "@/components/home/recommended-products";
import { AiDiscovered } from "@/components/home/ai-discovered";
import { CartSummary } from "@/components/home/cart-summary";
import { AiMemory } from "@/components/home/ai-memory";
import { Discover } from "@/components/home/discover";
import { CartPicker } from "@/components/home/cart-picker";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export default function HomePage() {
  const router = useRouter();

  const [showAiPanel, setShowAiPanel] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [sending, setSending] =
    useState(false);

  const [cartPickerOpen, setCartPickerOpen] =
    useState(false);

  const [selectedProduct, setSelectedProduct] =
    useState<RecommendedProduct | null>(null);

  const [cartGroups, setCartGroups] =
    useState<CartGroup[]>([]);

  useEffect(() => {
    setCartGroups(readCartGroups());
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

  const screenContext = useMemo(
    () => ({
      screen: "shopping-home",

      user: {
        name: "OO",
        grade: "SHOPPER",
        point: 2840,
        monthlySaving: 18400,
        aiUsage: 12,
      },

      shoppingStatus: {
        nextGradePoint: 160,
        progress: 78,
      },

      todayBriefing: {
        title:
          "이번 주 생필품을 준비할 시기예요.",
        description:
          "최근 구매 주기를 분석해보니 휴지와 세제를 다시 구매할 시기가 가까워졌어요.",
        estimatedShoppingAmount: 27800,
      },

      recommendedProducts:
        recommendedProducts.map(
          ({
            id,
            name,
            price,
            reason,
            badge,
          }) => ({
            id,
            name,
            price,
            reason,
            badge,
          }),
        ),

      cart: {
        name: "이번주 장보기",
        productCount: 7,
        estimatedPrice: 38200,
        progress: 70,
      },
    }),
    [],
  );

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

  const openAiPanel = () => {
    setShowAiPanel(true);
  };

  const closeAiPanel = () => {
    setShowAiPanel(false);
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

  const getAiReply = (
    text: string,
  ) => {
    const lower =
      text.toLowerCase();

    if (
      lower.includes("장보") ||
      lower.includes("쇼핑") ||
      lower.includes("뭐부터")
    ) {
      return `지금 홈 화면을 기준으로 보면 이번주 장보기를 준비할 시기예요.

현재 브리핑에서는 휴지와 세제를 다시 구매할 시기가 가까워졌다고 알려주고 있어요.

장바구니에는 현재 7개 상품이 있고 예상 금액은 38,200원이에요.

제가 먼저 추천한다면:

1. 크리넥스 3겹 화장지
2. 서울우유 1L
3. 계란 30구
4. 동원 참치 150g

특히 화장지는 최근 구매 주기가 가까워졌고, AI 발견 상품에서도 할인 중이라 먼저 확인해보는 걸 추천해요.`;
    }

    if (
      lower.includes("절약") ||
      lower.includes("아끼") ||
      lower.includes("돈")
    ) {
      return `현재 화면을 기준으로 보면 이번주 예상 장보기 금액은 약 27,800원이고, 현재 장바구니 예상 금액은 38,200원이에요.

절약하려면 AI가 발견한 할인 상품부터 확인하는 게 좋아요.

• 오뚜기 진라면 순한맛 — 17% 할인
• 크리넥스 3겹 화장지 — 24% 할인

특히 크리넥스는 최근 구매한 상품과 같은 브랜드이면서 평소보다 저렴하게 발견됐어요.`;
    }

    if (
      lower.includes("추천") ||
      lower.includes("상품")
    ) {
      return `지금 보고 있는 화면에서는 총 8개의 추천 상품이 있어요.

추천 이유를 보면 크게 네 가지예요.

• 다시 살 때
• 이번주 식단
• 함께 구매
• 구매 주기

그중 현재 구매 시기가 가장 가까운 상품은 크리넥스 3겹 화장지예요.

원하시면 제가 현재 추천 상품 중에서 "지금 꼭 필요한 것 / 나중에 사도 되는 것"으로 나눠드릴게요.`;
    }

    return `지금 보고 계신 쇼핑 홈 화면을 기준으로 답변할게요.

현재 상태는 SHOPPER 등급이고 2,840P를 보유하고 있어요.

이번 달에는 18,400원을 절약했고 AI를 12회 활용했어요.

이번주 장보기 예상 금액은 약 27,800원이고, 현재 장바구니에는 7개 상품이 담겨 있으며 예상 금액은 38,200원이에요.

무엇을 기준으로 도와드릴까요?`;
  };

  const handleAiSend = (
    text?: string,
  ) => {
    const content =
      (text ?? message).trim();

    if (!content || sending) {
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-user`,
        role: "user",
        content,
      },
    ]);

    setMessage("");
    setSending(true);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: getAiReply(content),
        },
      ]);

      setSending(false);
    }, 700);
  };

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-hidden bg-background">
      <HomeAiHeader
        active="home"
        onAiChat={openAiPanel}
      />

      <SwipeNav current={0}>
        <main className="w-[min(100%,100vw)] max-w-[100vw] min-w-0 overflow-x-hidden pb-28">
          <div className="w-full min-w-0">
            <HomeSearch onClick={goSearch} />

            <ShoppingStatus
              onClick={() =>
                router.push("/mypage")
              }
            />

            <AiGuide
              onClick={openAiPanel}
            />

            <TodayBriefing
              onClick={() =>
                router.push("/saved")
              }
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

            <CartSummary
              onClick={() =>
                router.push("/saved")
              }
            />

            <AiMemory
              onContinue={openAiPanel}
            />

            <Discover
              onProductClick={goProduct}
            />

            <div className="h-8" />
          </div>
        </main>
      </SwipeNav>

      <AiChatPanel
        open={showAiPanel}
        onClose={closeAiPanel}
        pageContext={screenContext.screen}
      />

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