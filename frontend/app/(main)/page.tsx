"use client";

import { useEffect, useMemo, useState } from "react";
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
  Plus,
} from "lucide-react";

import { HomeAiHeader } from "@/components/layout/home-ai-header";
import { SwipeNav } from "@/components/layout/swipe-nav";

const recommendedProducts = [
  {
    id: 1,
    name: "서울우유 1L",
    price: "2,490원",
    image:
      "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400",
    reason: "지난 구매 후 23일이 지났어요.",
    badge: "다시 살 때",
  },
  {
    id: 2,
    name: "동원 참치 150g",
    price: "3,280원",
    image:
      "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
    reason: "이번 주 식단에 필요한 재료예요.",
    badge: "식단 추천",
  },
  {
    id: 3,
    name: "CJ 햇반 210g × 6",
    price: "7,980원",
    image:
      "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400",
    reason: "최근 장보기에서 함께 구매했어요.",
    badge: "함께 구매",
  },
  {
    id: 4,
    name: "크리넥스 3겹 화장지",
    price: "12,900원",
    image:
      "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=400",
    reason: "최근 구매 주기가 가까워졌어요.",
    badge: "구매 시기",
  },
  {
    id: 5,
    name: "오뚜기 진라면 5입",
    price: "3,980원",
    image:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400",
    reason: "평소 자주 구매하는 상품이에요.",
    badge: "취향 추천",
  },
  {
    id: 6,
    name: "계란 30구",
    price: "8,990원",
    image:
      "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400",
    reason: "이번 주 식재료로 활용하기 좋아요.",
    badge: "식재료",
  },
  {
    id: 7,
    name: "섬유유연제 2L",
    price: "9,800원",
    image:
      "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=400",
    reason: "지난 구매일을 기준으로 추천했어요.",
    badge: "재구매",
  },
  {
    id: 8,
    name: "생수 2L × 6",
    price: "5,980원",
    image:
      "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400",
    reason: "최근 소비량을 기준으로 추천했어요.",
    badge: "생활필수",
  },
];

const discoveredProducts = [
  {
    id: 1,
    name: "오뚜기 진라면 순한맛",
    price: "3,980원",
    originalPrice: "4,800원",
    discount: "17%",
    reason: "평소보다 820원 저렴해요.",
  },
  {
    id: 2,
    name: "크리넥스 3겹 화장지",
    price: "12,900원",
    originalPrice: "16,900원",
    discount: "24%",
    reason: "최근 구매한 상품과 같은 브랜드예요.",
  },
];

const popularProducts = [
  {
    id: 1,
    name: "신라면 5입",
    price: "4,980원",
    image:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400",
  },
  {
    id: 2,
    name: "동원 참치",
    price: "3,280원",
    image:
      "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400",
  },
  {
    id: 3,
    name: "계란 30구",
    price: "8,990원",
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

export default function HomePage() {
  const [showAiPanel, setShowAiPanel] = useState(false);

  const [message, setMessage] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [sending, setSending] = useState(false);

  /*
   * ============================================================
   * 현재 홈 화면 정보
   *
   * 실제 AI API를 연결할 때 이 객체를 system prompt / context로
   * 전달하면 AI가 "현재 화면을 보고" 답변할 수 있다.
   * ============================================================
   */
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
        title: "이번 주 생필품을 준비할 시기예요.",
        description:
          "최근 구매 주기를 분석해보니 휴지와 세제를 다시 구매할 시기가 가까워졌어요.",
        estimatedShoppingAmount: 27800,
      },

      recommendedProducts: recommendedProducts.map(
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
        })
      ),

      aiDiscovered: discoveredProducts.map(
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
        })
      ),

      cart: {
        name: "이번주 장보기",
        productCount: 7,
        estimatedPrice: 38200,
        progress: 70,
      },

      aiMemory: {
        previousPlan:
          "지난번에 5만원 안에서 장보기로 했었어요.",
        suggestion:
          "이번에도 비슷한 예산으로 장보기를 준비해드릴까요?",
      },

      popularProducts: popularProducts.map(
        ({ id, name, price }) => ({
          id,
          name,
          price,
        })
      ),
    }),
    []
  );

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const previousHtmlOverflowX = html.style.overflowX;
    const previousBodyOverflowX = body.style.overflowX;

    html.style.overflowX = "hidden";
    body.style.overflowX = "hidden";

    return () => {
      html.style.overflowX = previousHtmlOverflowX;
      body.style.overflowX = previousBodyOverflowX;
    };
  }, []);

  /*
   * ============================================================
   * AI 열기
   * ============================================================
   */
  const openAiPanel = () => {
    setShowAiPanel(true);
  };

  /*
   * ============================================================
   * AI 닫기
   * ============================================================
   */
  const closeAiPanel = () => {
    setShowAiPanel(false);
  };

  /*
   * ============================================================
   * AI Mock Reply
   *
   * 현재 화면의 데이터를 실제로 참고하도록 구성
   * ============================================================
   */
  const getAiReply = (text: string) => {
    const lower = text.toLowerCase();

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

  /*
   * ============================================================
   * AI 메시지 전송
   * ============================================================
   */
  const handleAiSend = (text?: string) => {
    const content = (text ?? message).trim();

    if (!content || sending) return;

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setSending(true);

    /*
     * 실제 API 연결 시 여기에서 screenContext를 함께 전달.
     *
     * 예:
     *
     * fetch("/api/ai/chat", {
     *   method: "POST",
     *   body: JSON.stringify({
     *     message: content,
     *     screenContext,
     *   }),
     * })
     */

    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: getAiReply(content),
      };

      setMessages((prev) => [
        ...prev,
        assistantMessage,
      ]);

      setSending(false);
    }, 700);
  };

  const handleAiKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
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
      {/*
       * ==========================================================
       * 기존 Header
       *
       * ai chat 버튼은 기존 SVG 위치 그대로.
       * onAiChat만 연결한다.
       * ==========================================================
       */}
      <HomeAiHeader
        active="home"
        onAiChat={openAiPanel}
      />

      <SwipeNav current={0}>
        <main className="w-[min(100%,100vw)] max-w-[100vw] min-w-0 overflow-x-hidden pb-28">
          <div className="w-full min-w-0">

            {/* =====================================================
                SEARCH
            ====================================================== */}

            <section className="w-full min-w-0 px-4 pt-4 sm:px-6 lg:px-8">
              <button
                type="button"
                className="flex h-11 w-full min-w-0 items-center gap-3 rounded-[8px] bg-muted/70 px-3.5 text-left sm:h-12"
              >
                <Search
                  size={18}
                  className="shrink-0 text-muted-foreground"
                />

                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  찾고 싶은 상품을 검색해보세요
                </span>
              </button>
            </section>

            {/* =====================================================
                MY SHOPPING STATUS
            ====================================================== */}

            <section className="w-full min-w-0 px-4 pt-7 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="MY SHOPPING"
                title="나의 쇼핑 상태"
                action="자세히 보기"
              />

              <div className="w-full min-w-0 rounded-[8px] border border-border bg-background p-4 sm:p-5">
                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-muted-foreground">
                      안녕하세요, OO님
                    </p>

                    <p className="mt-1 truncate text-base font-semibold">
                      SHOPPER
                    </p>
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Star size={18} />
                  </div>
                </div>

                <div className="my-4 h-px w-full bg-border" />

                <div className="grid w-full min-w-0 grid-cols-3">
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

                <div className="mt-4 w-full min-w-0 rounded-[8px] bg-muted/60 px-3 py-3">
                  <div className="flex w-full min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                      다음 등급까지
                    </span>

                    <span className="shrink-0 text-[10px] font-medium">
                      160P
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-[8px] bg-border">
                    <div className="h-full w-[78%] rounded-[8px] bg-foreground" />
                  </div>
                </div>
              </div>
            </section>

            {/* =====================================================
                AI GUIDE
            ====================================================== */}

            <section className="w-[min(100%,100vw)] min-w-0 pt-7">
              <div className="px-4 sm:px-6 lg:px-8">
                <SectionTitle
                  eyebrow="AI FOR SHOPPING"
                  title="AI를 활용해보세요"
                />
              </div>

              <div className="w-full min-w-0 overflow-x-auto overflow-y-hidden scrollbar-hide">
                <div className="flex w-max gap-3 px-4 pb-1 sm:px-6 lg:px-8">
                  <AiGuideCard
                    icon={<Sparkles size={18} />}
                    title={"이번주 장보기를\nAI에게 맡겨보세요"}
                    description="필요한 상품부터 예산까지 한 번에 정리해드려요."
                    button="장보기 계획 세우기"
                    onClick={openAiPanel}
                  />

                  <AiGuideCard
                    icon={<ShoppingCart size={18} />}
                    title={"장보기 동선을\nAI가 만들어드려요"}
                    description="매장 안에서 가장 효율적인 순서로 안내해요."
                    button="동선 만들어보기"
                    onClick={openAiPanel}
                  />

                  <AiGuideCard
                    icon={<Wallet size={18} />}
                    title={"이번달 소비를\nAI에게 분석받아보세요"}
                    description="내 쇼핑 패턴을 분석하고 절약 방법을 찾아드려요."
                    button="소비 분석하기"
                    onClick={openAiPanel}
                  />
                </div>
              </div>
            </section>

            {/* =====================================================
                TODAY'S BRIEFING
            ====================================================== */}

            <section className="w-full min-w-0 px-4 pt-8 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="TODAY'S BRIEFING"
                title="오늘의 쇼핑 브리핑"
              />

              <div className="w-full min-w-0 rounded-[8px] bg-muted/70 p-4">
                <div className="flex w-full min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-background">
                    <Lightbulb size={17} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="break-keep text-sm font-semibold">
                      이번 주 생필품을 준비할 시기예요.
                    </p>

                    <p className="mt-1 break-keep text-xs leading-5 text-muted-foreground">
                      최근 구매 주기를 분석해보니 휴지와 세제를 다시 구매할
                      시기가 가까워졌어요.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex w-full min-w-0 items-center justify-between gap-3 rounded-[8px] bg-background px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] text-muted-foreground">
                      예상 장보기 금액
                    </p>

                    <p className="mt-1 truncate text-sm font-semibold">
                      약 27,800원
                    </p>
                  </div>

                  <button
                    type="button"
                    className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-medium"
                  >
                    장보기 보기
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </section>

            {/* =====================================================
                BRIEFING RECOMMENDATION
            ====================================================== */}

            <section className="w-full min-w-0 px-4 pt-8 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="FOR YOU"
                title="브리핑에 맞춰 추천해요"
              />

              <div className="grid w-full min-w-0 grid-cols-2 gap-x-3 gap-y-5">
                {recommendedProducts.map((product) => (
                  <RecommendedProductCard
                    key={product.id}
                    product={product}
                  />
                ))}
              </div>

              <button
                type="button"
                className="mt-6 flex h-10 w-full min-w-0 items-center justify-center gap-1 rounded-[8px] border border-border text-xs font-medium"
              >
                추천 상품 더보기
                <ChevronRight size={14} />
              </button>
            </section>

            {/* =====================================================
                AI DISCOVERED
            ====================================================== */}

            <section className="w-full min-w-0 px-4 pt-8 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="AI DISCOVERED"
                title="AI가 발견한 것"
                description="OO님의 쇼핑 기록에서 찾았어요."
              />

              <div className="w-full min-w-0 space-y-2">
                {discoveredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="w-full min-w-0 rounded-[8px] border border-border p-3.5"
                  >
                    <div className="flex w-full min-w-0 items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="shrink-0 rounded-[8px] bg-muted px-2 py-1 text-[9px] font-medium">
                            {product.discount} OFF
                          </span>

                          <span className="shrink-0 text-[9px] text-muted-foreground">
                            AI 발견
                          </span>
                        </div>

                        <p className="mt-2 break-keep text-sm font-medium">
                          {product.name}
                        </p>

                        <div className="mt-1 flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-sm font-semibold">
                            {product.price}
                          </span>

                          <span className="min-w-0 truncate text-[10px] text-muted-foreground line-through">
                            {product.originalPrice}
                          </span>
                        </div>
                      </div>

                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-muted">
                        <TrendingDown size={15} />
                      </div>
                    </div>

                    <div className="mt-3 flex w-full min-w-0 items-start gap-1.5">
                      <Sparkles
                        size={12}
                        className="mt-0.5 shrink-0 text-muted-foreground"
                      />

                      <p className="min-w-0 break-keep text-[10px] leading-4 text-muted-foreground">
                        {product.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* =====================================================
                CART
            ====================================================== */}

            <section className="w-full min-w-0 px-4 pt-8 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="MY SHOPPING"
                title="나의 장바구니"
                action="전체보기"
              />

              <div className="w-full min-w-0 rounded-[8px] border border-border p-4">
                <div className="flex w-full min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-muted">
                    <ShoppingCart size={18} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      이번주 장보기
                    </p>

                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      상품 7개 · 예상 38,200원
                    </p>
                  </div>

                  <ChevronRight
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                </div>

                <div className="mt-4 w-full min-w-0">
                  <div className="flex w-full min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-[10px] text-muted-foreground">
                      준비 진행률
                    </span>

                    <span className="shrink-0 text-[10px] font-medium">
                      70%
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-[8px] bg-muted">
                    <div className="h-full w-[70%] rounded-[8px] bg-foreground" />
                  </div>
                </div>
              </div>
            </section>

            {/* =====================================================
                AI MEMORY
            ====================================================== */}

            <section className="w-full min-w-0 px-4 pt-8 sm:px-6 lg:px-8">
              <SectionTitle
                eyebrow="AI MEMORY"
                title="AI가 기억하고 있어요"
              />

              <div className="w-full min-w-0 rounded-[8px] bg-muted/70 p-4">
                <div className="flex w-full min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background">
                    <Sparkles size={16} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="break-keep text-sm font-medium leading-5">
                      지난번에 5만원 안에서 장보기로 했었어요.
                    </p>

                    <p className="mt-2 break-keep text-xs leading-5 text-muted-foreground">
                      이번에도 비슷한 예산으로 장보기를 준비해드릴까요?
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={openAiPanel}
                  className="mt-4 flex w-full min-w-0 items-center justify-center gap-1 rounded-[8px] bg-background py-2.5 text-[10px] font-medium"
                >
                  지난 계획 이어가기
                  <ArrowRight size={12} />
                </button>
              </div>
            </section>

            {/* =====================================================
                DISCOVER
            ====================================================== */}

            <section className="w-[min(100%,100vw)] min-w-0 pt-10">
              <div className="px-4 sm:px-6 lg:px-8">
                <SectionTitle
                  eyebrow="DISCOVER"
                  title="발견해보세요"
                  action="더보기"
                />
              </div>

              <div className="w-full min-w-0 overflow-x-auto overflow-y-hidden scrollbar-hide">
                <div className="flex w-max gap-3 px-4 pb-1 sm:px-6 lg:px-8">
                  {popularProducts.map((product) => (
                    <div
                      key={product.id}
                      className="w-[140px] shrink-0"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-[8px] bg-muted">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />

                        <button
                          type="button"
                          className="absolute right-2 top-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/90"
                        >
                          <Heart size={14} />
                        </button>
                      </div>

                      <p className="mt-2 truncate text-xs font-medium">
                        {product.name}
                      </p>

                      <p className="mt-1 text-xs font-semibold">
                        {product.price}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="h-8" />
          </div>
        </main>
      </SwipeNav>

      {/* ============================================================
          AI SIDE PANEL

          핵심:
          - fixed
          - 홈 콘텐츠를 밀지 않음
          - 오른쪽에서 등장
          - 홈 화면은 그대로 사용 가능
          ============================================================ */}

      {showAiPanel && (
        <>
          {/* 모바일 / 패널 바깥 영역 */}
          <button
            type="button"
            aria-label="AI 패널 닫기"
            onClick={closeAiPanel}
            className="fixed inset-0 z-[80] bg-black/20"
          />

          {/* ========================================================
              AI PANEL
          ======================================================== */}

          <aside
            className="
              fixed
              right-0
              top-0
              z-[90]
              flex
              h-[100dvh]
              w-full
              flex-col
              border-l
              border-border
              bg-background
              shadow-2xl
              sm:w-[420px]
              lg:w-[460px]
            "
          >
            {/* ======================================================
                PANEL HEADER
            ====================================================== */}

            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background">
                  AI
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    AI Chat
                  </p>

                  <p className="text-[10px] text-muted-foreground">
                    지금 보고 있는 쇼핑 화면을 이해하고 있어요
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeAiPanel}
                aria-label="AI Chat 닫기"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-muted"
              >
                <X size={19} />
              </button>
            </div>

            {/* ======================================================
                AI CONTEXT
            ====================================================== */}

            <div className="border-b border-border bg-muted/40 px-5 py-3">
              <div className="flex items-center gap-2">
                <Sparkles
                  size={14}
                  className="shrink-0"
                />

                <p className="text-[11px] text-muted-foreground">
                  홈 화면을 바탕으로 답변할 수 있어요.
                </p>
              </div>
            </div>

            {/* ======================================================
                CHAT
            ====================================================== */}

            <div className="flex-1 overflow-y-auto px-5 py-6">
              {messages.length === 0 ? (
                <div className="flex min-h-full flex-col justify-center">
                  <div className="mb-8">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                      AI
                    </div>

                    <h2 className="text-xl font-semibold tracking-tight">
                      지금 화면에서
                      <br />
                      무엇을 도와드릴까요?
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      현재 보고 있는 추천 상품,
                      <br />
                      장보기 상태와 브리핑을 기준으로
                      답변해드릴게요.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {suggestedPrompts.map(
                      (prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() =>
                            handleAiSend(prompt)
                          }
                          className="w-full rounded-2xl border border-border px-4 py-3.5 text-left text-sm transition hover:bg-muted"
                        >
                          {prompt}
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-7">
                  {messages.map((chat) => (
                    <div
                      key={chat.id}
                      className={
                        chat.role === "user"
                          ? "flex justify-end"
                          : "flex justify-start"
                      }
                    >
                      {chat.role === "user" ? (
                        <div className="max-w-[85%] rounded-3xl bg-muted px-4 py-3 text-sm leading-6">
                          {chat.content}
                        </div>
                      ) : (
                        <div className="w-full">
                          <div className="mb-2 flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[8px] font-bold text-background">
                              AI
                            </div>

                            <span className="text-xs font-medium text-muted-foreground">
                              AI
                            </span>
                          </div>

                          <div className="whitespace-pre-wrap text-sm leading-6">
                            {chat.content}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {sending && (
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[8px] font-bold text-background">
                        AI
                      </div>

                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ======================================================
                INPUT
            ====================================================== */}

            <div className="shrink-0 border-t border-border bg-background px-4 pb-5 pt-3">
              <div className="rounded-3xl border border-border bg-background p-2 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
                <textarea
                  value={message}
                  onChange={(e) =>
                    setMessage(e.target.value)
                  }
                  onKeyDown={handleAiKeyDown}
                  rows={1}
                  placeholder="현재 화면에 대해 물어보세요"
                  className="max-h-32 min-h-11 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground"
                />

                <div className="flex items-center justify-between px-1 pb-1 pt-1">
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                    aria-label="자료 추가"
                  >
                    <Plus
                      size={18}
                      strokeWidth={1.8}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleAiSend()
                    }
                    disabled={
                      !message.trim() ||
                      sending
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background transition disabled:opacity-30"
                    aria-label="전송"
                  >
                    <ArrowUp
                      size={18}
                      strokeWidth={2.2}
                    />
                  </button>
                </div>
              </div>

              <p className="mt-2 text-center text-[9px] text-muted-foreground">
                AI의 답변은 정확하지 않을 수 있어요.
              </p>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

/* ===============================================================
   SECTION TITLE
================================================================ */

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
    <div className="mb-3 w-full min-w-0">
      <div className="flex w-full min-w-0 items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-medium tracking-wide text-muted-foreground">
            {eyebrow}
          </p>

          <h2 className="mt-1 break-keep text-lg font-semibold tracking-tight">
            {title}
          </h2>

          {description && (
            <p className="mt-1 break-keep text-[10px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {action && (
          <button
            type="button"
            className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground"
          >
            {action}
          </button>
        )}
      </div>
    </div>
  );
}

/* ===============================================================
   STATUS ITEM
================================================================ */

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
      className={`min-w-0 px-2 ${
        border ? "border-l border-border" : ""
      }`}
    >
      <p className="truncate text-[9px] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 truncate text-[13px] font-semibold">
        {value}
      </p>
    </div>
  );
}

/* ===============================================================
   AI GUIDE CARD
================================================================ */

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
    <div className="w-[78vw] max-w-[280px] shrink-0 rounded-[8px] border border-border p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-muted">
        {icon}
      </div>

      <h3 className="mt-4 whitespace-pre-line break-keep text-sm font-semibold leading-5">
        {title}
      </h3>

      <p className="mt-2 h-10 break-keep text-[10px] leading-4 text-muted-foreground">
        {description}
      </p>

      <button
        type="button"
        onClick={onClick}
        className="mt-4 flex items-center gap-1 whitespace-nowrap text-[10px] font-medium"
      >
        {button}
        <ArrowRight size={11} />
      </button>
    </div>
  );
}

/* ===============================================================
   RECOMMENDED PRODUCT
================================================================ */

function RecommendedProductCard({
  product,
}: {
  product: (typeof recommendedProducts)[number];
}) {
  return (
    <div className="w-full min-w-0">
      <div className="relative aspect-square w-full min-w-0 overflow-hidden rounded-[8px] bg-muted">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover"
        />

        <div className="absolute left-2 top-2 max-w-[calc(100%-40px)] truncate rounded-[8px] bg-background/90 px-1.5 py-1 text-[8px] font-medium">
          {product.badge}
        </div>

        <button
          type="button"
          className="absolute right-2 top-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/90"
        >
          <Heart size={13} />
        </button>
      </div>

      <p className="mt-2 truncate text-xs font-medium">
        {product.name}
      </p>

      <p className="mt-1 truncate text-xs font-semibold">
        {product.price}
      </p>

      <div className="mt-2 w-full min-w-0 rounded-[8px] bg-muted/60 p-2">
        <div className="flex w-full min-w-0 items-center gap-1">
          <Sparkles size={9} className="shrink-0" />

          <span className="min-w-0 truncate text-[8px] font-medium">
            왜 추천했을까요?
          </span>
        </div>

        <p className="mt-1 line-clamp-2 break-keep text-[8px] leading-3 text-muted-foreground">
          {product.reason}
        </p>
      </div>
    </div>
  );
}