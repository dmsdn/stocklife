"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowRight,
  ChevronRight,
  Heart,
  Lightbulb,
  Search,
  ShoppingCart,
  Sparkles,
  Star,
  TrendingDown,
  Wallet,
  X,
  ArrowUp,
} from "lucide-react";

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

const recommendedProducts = [
  {
    id: 1,
    name: "서울우유 1L",
    category: "유제품",
    price: 2490,
    image:
      "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400",
    reason:
      "지난 구매 후 23일이 지났어요.",
    badge: "다시 살 때",
  },
  {
    id: 2,
    name: "동원 참치 150g",
    category: "가공식품",
    price: 3280,
    image:
      "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
    reason:
      "이번 주 식단에 필요한 재료예요.",
    badge: "식단 추천",
  },
  {
    id: 3,
    name: "CJ 햇반 210g × 6",
    category: "즉석식품",
    price: 7980,
    image:
      "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400",
    reason:
      "최근 장보기에서 함께 구매했어요.",
    badge: "함께 구매",
  },
  {
    id: 4,
    name: "크리넥스 3겹 화장지",
    category: "생활용품",
    price: 12900,
    image:
      "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=400",
    reason:
      "최근 구매 주기가 가까워졌어요.",
    badge: "구매 시기",
  },
  {
    id: 5,
    name: "오뚜기 진라면 5입",
    category: "라면",
    price: 3980,
    image:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400",
    reason:
      "평소 자주 구매하는 상품이에요.",
    badge: "취향 추천",
  },
  {
    id: 6,
    name: "계란 30구",
    category: "신선식품",
    price: 8990,
    image:
      "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400",
    reason:
      "이번 주 식재료로 활용하기 좋아요.",
    badge: "식재료",
  },
  {
    id: 7,
    name: "섬유유연제 2L",
    category: "생활용품",
    price: 9800,
    image:
      "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=400",
    reason:
      "지난 구매일을 기준으로 추천했어요.",
    badge: "재구매",
  },
  {
    id: 8,
    name: "생수 2L × 6",
    category: "음료",
    price: 5980,
    image:
      "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400",
    reason:
      "최근 소비량을 기준으로 추천했어요.",
    badge: "생활필수",
  },
];

const discoveredProducts = [
  {
    id: 1,
    name: "오뚜기 진라면 순한맛",
    category: "라면",
    price: 3980,
    originalPrice: 4800,
    discount: "17%",
    reason:
      "평소보다 820원 저렴해요.",
  },
  {
    id: 2,
    name: "크리넥스 3겹 화장지",
    category:
      "생활용품",
    price: 12900,
    originalPrice: 16900,
    discount: "24%",
    reason:
      "최근 구매한 상품과 같은 브랜드예요.",
  },
];

const popularProducts = [
  {
    id: 1,
    name: "신라면 5입",
    category: "라면",
    price: 4980,
    image:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400",
  },
  {
    id: 2,
    name: "동원 참치",
    category:
      "가공식품",
    price: 3280,
    image:
      "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
  },
  {
    id: 3,
    name: "계란 30구",
    category:
      "신선식품",
    price: 8990,
    image:
      "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400",
  },
];

const suggestedPrompts = [
  "이번주 장보기 계획 세워줘",
  "추천 상품 중에 뭐부터 사야해?",
  "이번주 식비를 아끼고 싶어",
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function formatPrice(
  price: number,
) {
  return `${price.toLocaleString(
    "ko-KR",
  )}원`;
}

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

  const [
    cartPickerOpen,
    setCartPickerOpen,
  ] = useState(false);

  const [
    selectedProduct,
    setSelectedProduct,
  ] = useState<
    (typeof recommendedProducts)[number] | null
  >(null);

  const [
    cartGroups,
    setCartGroups,
  ] = useState<CartGroup[]>([]);

  useEffect(() => {
    setCartGroups(
      readCartGroups(),
    );
  }, []);

  useEffect(() => {
    const html =
      document.documentElement;
    const body =
      document.body;

    const previousHtmlOverflowX =
      html.style.overflowX;

    const previousBodyOverflowX =
      body.style.overflowX;

    html.style.overflowX =
      "hidden";

    body.style.overflowX =
      "hidden";

    return () => {
      html.style.overflowX =
        previousHtmlOverflowX;

      body.style.overflowX =
        previousBodyOverflowX;
    };
  }, []);

  const screenContext = useMemo(
    () => ({
      screen:
        "shopping-home",

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

      aiDiscovered:
        discoveredProducts.map(
          ({
            id,
            name,
            price,
            originalPrice,
            discount,
            reason,
          }) => ({
            id,
            name,
            price,
            originalPrice,
            discount,
            reason,
          }),
        ),

      cart: {
        name:
          "이번주 장보기",
        productCount: 7,
        estimatedPrice: 38200,
        progress: 70,
      },

      popularProducts:
        popularProducts.map(
          ({
            id,
            name,
            price,
          }) => ({
            id,
            name,
            price,
          }),
        ),
    }),
    [],
  );

  const goSearch = () => {
    router.push(
      "/search",
    );
  };

  /*
   * 현재 프로젝트에서 상품 상세 페이지가
   * 별도로 만들어지기 전까지 검색 화면에
   * productId를 넘겨 상품을 지정한다.
   */
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
    product: (typeof recommendedProducts)[number],
  ) => {
    setSelectedProduct(
      product,
    );

    setCartGroups(
      readCartGroups(),
    );

    setCartPickerOpen(
      true,
    );
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
          id:
            selectedProduct.id,
          name:
            selectedProduct.name,
          category:
            selectedProduct.category,
          price:
            selectedProduct.price,
          image:
            selectedProduct.image,
        },
      );

    setCartGroups(
      nextGroups,
    );

    setCartPickerOpen(
      false,
    );

    setSelectedProduct(
      null,
    );
  };

  const handleCreateCart =
    () => {
      if (!selectedProduct) {
        return;
      }

      const newGroup =
        createCartGroup(
          "새 장보기",
        );

      const nextGroups =
        addProductToCartGroup(
          newGroup.id,
          {
            id:
              selectedProduct.id,
            name:
              selectedProduct.name,
            category:
              selectedProduct.category,
            price:
              selectedProduct.price,
            image:
              selectedProduct.image,
          },
        );

      setCartGroups(
        nextGroups,
      );

      setCartPickerOpen(
        false,
      );

      setSelectedProduct(
        null,
      );
    };

  const getAiReply = (
    text: string,
  ) => {
    const lower =
      text.toLowerCase();

    if (
      lower.includes("장보") ||
      lower.includes("쇼핑") ||
      lower.includes(
        "뭐부터",
      )
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
    const content = (
      text ?? message
    ).trim();

    if (
      !content ||
      sending
    ) {
      return;
    }

    setMessages(
      (prev) => [
        ...prev,
        {
          id: `${Date.now()}-user`,
          role: "user",
          content,
        },
      ],
    );

    setMessage("");
    setSending(true);

    setTimeout(() => {
      setMessages(
        (prev) => [
          ...prev,
          {
            id: `${Date.now()}-assistant`,
            role: "assistant",
            content:
              getAiReply(
                content,
              ),
          },
        ],
      );

      setSending(false);
    }, 700);
  };

  const handleAiKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey
    ) {
      e.preventDefault();
      handleAiSend();
    }
  };

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-hidden bg-background">
      <HomeAiHeader
        active="home"
        onAiChat={
          openAiPanel
        }
      />

      <SwipeNav current={0}>
        <main className="w-[min(100%,100vw)] max-w-[100vw] min-w-0 overflow-x-hidden pb-28">
          <div className="w-full min-w-0">

            {/* 검색 */}
            <section className="w-full px-4 pt-4 sm:px-6 lg:px-8">
              <button
                type="button"
                onClick={
                  goSearch
                }
                className="flex h-11 w-full items-center gap-3 rounded-sm bg-muted/70 px-3.5 text-left sm:h-12"
              >
                <Search
                  size={18}
                  className="shrink-0 text-muted-foreground"
                />

                <span className="truncate text-sm text-muted-foreground">
                  찾고 싶은 상품을 검색해보세요
                </span>
              </button>
            </section>

            {/* 나의 쇼핑 상태 */}
            <section className="w-full px-4 pt-7 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="MY SHOPPING"
                title="나의 쇼핑 상태"
                action="자세히 보기"
              />

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/mypage",
                  )
                }
                className="w-full rounded-sm border border-border bg-background p-4 text-left sm:p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-muted-foreground">
                      안녕하세요, OO님
                    </p>

                    <p className="mt-1 text-base font-semibold">
                      SHOPPER
                    </p>
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Star size={18} />
                  </div>
                </div>

                <div className="my-4 h-px bg-border" />

                <div className="grid grid-cols-3">
                  <StatusItem
                    label="보유 포인트"
                    value="2,840P"
                  />

                  <StatusItem
                    label="이번 달 절약"
                    value="18,400원"
                    border
                  />

                  <StatusItem
                    label="AI 활용"
                    value="12회"
                    border
                  />
                </div>

                <div className="mt-4 rounded-sm bg-muted/60 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      다음 등급까지
                    </span>

                    <span className="text-base font-medium">
                      160P
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-border">
                    <div className="h-full w-[78%] rounded-sm bg-foreground" />
                  </div>
                </div>
              </button>
            </section>

            {/* AI 활용 */}
            <section className="w-full pt-7">
              <div className="px-4 sm:px-6 lg:px-8">
                <SectionTitle
                  eyebrow="AI FOR SHOPPING"
                  title="AI를 활용해보세요"
                />
              </div>

              <div className="w-full overflow-x-auto scrollbar-hide">
                <div className="flex w-max gap-3 px-4 pb-1 sm:px-6 lg:px-8">
                  <AiGuideCard
                    icon={
                      <Sparkles size={18} />
                    }
                    title={
                      "이번주 장보기를\nAI에게 맡겨보세요"
                    }
                    description="필요한 상품부터 예산까지 한 번에 정리해드려요."
                    button="장보기 계획 세우기"
                    onClick={
                      openAiPanel
                    }
                  />

                  <AiGuideCard
                    icon={
                      <ShoppingCart
                        size={18}
                      />
                    }
                    title={
                      "장보기 동선을\nAI가 만들어드려요"
                    }
                    description="매장 안에서 가장 효율적인 순서로 안내해요."
                    button="동선 만들어보기"
                    onClick={
                      openAiPanel
                    }
                  />

                  <AiGuideCard
                    icon={
                      <Wallet size={18} />
                    }
                    title={
                      "이번달 소비를\nAI에게 분석받아보세요"
                    }
                    description="내 쇼핑 패턴을 분석하고 절약 방법을 찾아드려요."
                    button="소비 분석하기"
                    onClick={
                      openAiPanel
                    }
                  />
                </div>
              </div>
            </section>

            {/* 브리핑 */}
            <section className="w-full px-4 pt-8 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="TODAY'S BRIEFING"
                title="오늘의 쇼핑 브리핑"
              />

              <div className="rounded-sm bg-muted/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-background">
                    <Lightbulb size={17} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold">
                      이번 주 생필품을 준비할 시기예요.
                    </p>

                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      최근 구매 주기를 분석해보니 휴지와 세제를 다시 구매할 시기가 가까워졌어요.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      "/saved",
                    )
                  }
                  className="mt-4 flex w-full items-center justify-between rounded-sm bg-background px-3 py-3 text-left"
                >
                  <div>
                    <p className="text-sm text-muted-foreground">
                      예상 장보기 금액
                    </p>

                    <p className="mt-1 text-base font-semibold">
                      약 27,800원
                    </p>
                  </div>

                  <span className="flex items-center gap-1 text-sm font-medium">
                    장보기 보기
                    <ArrowRight size={12} />
                  </span>
                </button>
              </div>
            </section>

            {/* 추천 상품 */}
            <section className="w-full px-4 pt-8 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="FOR YOU"
                title="브리핑에 맞춰 추천해요"
              />

              <div className="grid grid-cols-2 gap-x-3 gap-y-5">
                {recommendedProducts.map(
                  (product) => (
                    <RecommendedProductCard
                      key={product.id}
                      product={product}
                      onProductClick={() =>
                        goProduct(
                          product.id,
                        )
                      }
                      onSave={() =>
                        openCartPicker(
                          product,
                        )
                      }
                    />
                  ),
                )}
              </div>

              <button
                type="button"
                onClick={
                  goSearch
                }
                className="mt-6 flex h-10 w-full items-center justify-center gap-1 rounded-sm border border-border text-sm font-medium"
              >
                추천 상품 더보기
                <ChevronRight size={14} />
              </button>
            </section>

            {/* AI 발견 */}
            <section className="w-full px-4 pt-8 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="AI DISCOVERED"
                title="AI가 발견한 것"
                description="OO님의 쇼핑 기록에서 찾았어요."
              />

              <div className="space-y-2">
                {discoveredProducts.map(
                  (product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() =>
                        goProduct(
                          product.id,
                        )
                      }
                      className="w-full rounded-sm border border-border p-3.5 text-left"
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-sm bg-muted px-2 py-1 text-xs font-medium">
                              {
                                product.discount
                              } OFF
                            </span>

                            <span className="text-xs text-muted-foreground">
                              AI 발견
                            </span>
                          </div>

                          <p className="mt-2 text-base font-medium">
                            {product.name}
                          </p>

                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-base font-semibold">
                              {formatPrice(
                                product.price,
                              )}
                            </span>

                            <span className="text-sm text-muted-foreground line-through">
                              {formatPrice(
                                product.originalPrice,
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-muted">
                          <TrendingDown size={15} />
                        </div>
                      </div>

                      <div className="mt-3 flex items-start gap-1.5">
                        <Sparkles
                          size={12}
                          className="mt-0.5 shrink-0 text-muted-foreground"
                        />

                        <p className="text-sm leading-4 text-muted-foreground">
                          {product.reason}
                        </p>
                      </div>
                    </button>
                  ),
                )}
              </div>
            </section>

            {/* 나의 장바구니 */}
            <section className="w-full px-4 pt-8 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="MY SHOPPING"
                title="나의 장바구니"
                action="전체보기"
              />

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/saved",
                  )
                }
                className="w-full rounded-sm border border-border p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-muted">
                    <ShoppingCart size={18} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold">
                      이번주 장보기
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      상품 7개 · 예상 38,200원
                    </p>
                  </div>

                  <ChevronRight
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      준비 진행률
                    </span>

                    <span className="text-sm font-medium">
                      70%
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
                    <div className="h-full w-[70%] rounded-sm bg-foreground" />
                  </div>
                </div>
              </button>
            </section>

            {/* AI 기억 */}
            <section className="w-full px-4 pt-8 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="AI MEMORY"
                title="AI가 기억하고 있어요"
              />

              <div className="rounded-sm bg-muted/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background">
                    <Sparkles size={16} />
                  </div>

                  <div>
                    <p className="text-sm font-medium">
                      지난번에 5만원 안에서 장보기로 했었어요.
                    </p>

                    <p className="mt-2 text-sm leading-5 text-muted-foreground">
                      이번에도 비슷한 예산으로 장보기를 준비해드릴까요?
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={
                    openAiPanel
                  }
                  className="mt-4 flex w-full items-center justify-center gap-1 rounded-sm bg-background py-2.5 text-sm font-medium"
                >
                  지난 계획 이어가기
                  <ArrowRight size={12} />
                </button>
              </div>
            </section>

            {/* 발견 */}
            <section className="w-full pt-10">
              <div className="px-4 sm:px-6 lg:px-8">
                <SectionTitle
                  eyebrow="DISCOVER"
                  title="발견해보세요"
                  action="더보기"
                />
              </div>

              <div className="w-full overflow-x-auto scrollbar-hide">
                <div className="flex w-max gap-3 px-4 pb-1 sm:px-6 lg:px-8">
                  {popularProducts.map(
                    (product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() =>
                          goProduct(
                            product.id,
                          )
                        }
                        className="w-[140px] shrink-0 text-left"
                      >
                        <div className="relative aspect-square overflow-hidden rounded-sm bg-muted">
                          <img
                            src={
                              product.image
                            }
                            alt={
                              product.name
                            }
                            className="h-full w-full object-cover"
                          />
                        </div>

                        <p className="mt-2 truncate text-base font-medium">
                          {product.name}
                        </p>

                        <p className="mt-1 text-base font-semibold">
                          {formatPrice(
                            product.price,
                          )}
                        </p>
                      </button>
                    ),
                  )}
                </div>
              </div>
            </section>

            <div className="h-8" />
          </div>
        </main>
      </SwipeNav>

      {/* AI 패널 */}
      <AiChatPanel
        open={showAiPanel}
        onClose={
          closeAiPanel
        }
        pageContext={
          screenContext.screen
        }
      />

      {/* 장바구니 선택 */}
      {cartPickerOpen &&
        selectedProduct && (
          <div className="fixed inset-0 z-[120]">
            <button
              type="button"
              onClick={() => {
                setCartPickerOpen(
                  false,
                );
                setSelectedProduct(
                  null,
                );
              }}
              className="absolute inset-0 bg-black/30"
              aria-label="닫기"
            />

            <div className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-background px-5 pb-8 pt-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    장바구니에 담기
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {
                      selectedProduct.name
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCartPickerOpen(
                      false,
                    );
                    setSelectedProduct(
                      null,
                    );
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-2">
                {cartGroups.map(
                  (group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() =>
                        handleAddToCart(
                          group.id,
                        )
                      }
                      className="flex w-full items-center justify-between rounded-sm border border-border px-4 py-3.5 text-left hover:bg-muted"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {
                            group.title
                          }
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {
                            group.products
                              .length
                          }
                          개 상품
                        </p>
                      </div>

                      <ChevronRight
                        size={16}
                        className="text-muted-foreground"
                      />
                    </button>
                  ),
                )}

                <button
                  type="button"
                  onClick={
                    handleCreateCart
                  }
                  className="flex w-full items-center justify-center rounded-sm border border-dashed border-border px-4 py-3.5 text-sm font-medium hover:bg-muted"
                >
                  + 새 장바구니 만들기
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  action,
  description,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            {eyebrow}
          </p>

          <h2 className="mt-1 text-lg font-semibold">
            {title}
          </h2>

          {description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {action && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {action}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusItem({
  label,
  value,
  border = false,
}: {
  label: string;
  value: string;
  border?: boolean;
}) {
  return (
    <div
      className={`px-2 ${
        border
          ? "border-l border-border"
          : ""
      }`}
    >
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-base font-semibold">
        {value}
      </p>
    </div>
  );
}

function AiGuideCard({
  icon,
  title,
  description,
  button,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <div className="w-[78vw] max-w-[280px] shrink-0 rounded-sm border border-border p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-muted">
        {icon}
      </div>

      <h3 className="mt-4 whitespace-pre-line text-md font-semibold leading-5">
        {title}
      </h3>

      <p className="mt-2 h-10 text-sm leading-4 text-muted-foreground">
        {description}
      </p>

      <button
        type="button"
        onClick={onClick}
        className="mt-4 flex items-center gap-1 text-sm font-medium"
      >
        {button}
        <ArrowRight size={11} />
      </button>
    </div>
  );
}

function RecommendedProductCard({
  product,
  onProductClick,
  onSave,
}: {
  product: (typeof recommendedProducts)[number];
  onProductClick: () => void;
  onSave: () => void;
}) {
  return (
    <div className="w-full min-w-0">
      <div className="relative">
        <button
          type="button"
          onClick={
            onProductClick
          }
          className="block w-full text-left"
        >
          <div className="relative aspect-square overflow-hidden rounded-sm bg-muted">
            <img
              src={
                product.image
              }
              alt={
                product.name
              }
              className="h-full w-full object-cover"
            />

            <div className="absolute left-2 top-2 max-w-[calc(100%-40px)] truncate rounded-sm bg-background/90 px-1.5 py-1 text-[8px] font-medium">
              {
                product.badge
              }
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={
            onSave
          }
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90"
          aria-label={`${product.name} 장바구니 저장`}
        >
          <Heart size={13} />
        </button>
      </div>

      <button
        type="button"
        onClick={
          onProductClick
        }
        className="mt-2 block w-full text-left"
      >
        <p className="truncate text-base font-medium">
          {product.name}
        </p>

        <p className="mt-1 text-base font-semibold">
          {formatPrice(
            product.price,
          )}
        </p>
      </button>

      <div className="mt-2 rounded-sm bg-muted/60 p-2">
        <div className="flex items-center gap-1">
          <Sparkles
            size={9}
            className="shrink-0"
          />

          <span className="truncate text-xs font-medium">
            왜 추천했을까요?
          </span>
        </div>
 
        <p className="mt-1 line-clamp-2 text-xs leading-3 text-muted-foreground">
          {product.reason}
        </p>
      </div>
    </div>
  );
}