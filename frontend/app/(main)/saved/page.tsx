// app/(main)/saved/page.tsx

"use client";

import { useMemo, useState } from "react";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  quantity: number;
  checked: boolean;
};

type CartGroup = {
  id: number;
  title: string;
  description: string;
  createdAt: string;
  store: string;
  products: Product[];
};

type AiConversation = {
  id: number;
  title: string;
  preview: string;
  date: string;
};

const initialCartGroups: CartGroup[] = [
  {
    id: 1,
    title: "이번 주 장보기",
    description: "일주일 식재료",
    createdAt: "오늘",
    store: "이마트 성수점",
    products: [
      {
        id: 1,
        name: "서울우유 1L",
        category: "유제품",
        price: 2900,
        quantity: 2,
        checked: true,
      },
      {
        id: 2,
        name: "계란 15구",
        category: "신선식품",
        price: 7500,
        quantity: 1,
        checked: true,
      },
      {
        id: 3,
        name: "바나나",
        category: "과일",
        price: 4000,
        quantity: 1,
        checked: false,
      },
      {
        id: 4,
        name: "닭가슴살",
        category: "냉동식품",
        price: 4000,
        quantity: 3,
        checked: true,
      },
      {
        id: 5,
        name: "양파",
        category: "채소",
        price: 3200,
        quantity: 1,
        checked: false,
      },
    ],
  },
  {
    id: 2,
    title: "자취방 채우기",
    description: "생활용품 정리",
    createdAt: "어제",
    store: "쿠팡",
    products: [
      {
        id: 6,
        name: "두루마리 휴지",
        category: "생활용품",
        price: 8900,
        quantity: 1,
        checked: true,
      },
      {
        id: 7,
        name: "세탁세제",
        category: "생활용품",
        price: 12500,
        quantity: 1,
        checked: true,
      },
      {
        id: 8,
        name: "주방세제",
        category: "생활용품",
        price: 4500,
        quantity: 2,
        checked: false,
      },
    ],
  },
  {
    id: 3,
    title: "주말 브런치",
    description: "친구들이랑 먹을 것",
    createdAt: "8월 15일",
    store: "홈플러스 강서점",
    products: [
      {
        id: 9,
        name: "식빵",
        category: "베이커리",
        price: 3800,
        quantity: 1,
        checked: true,
      },
      {
        id: 10,
        name: "딸기잼",
        category: "소스",
        price: 5200,
        quantity: 1,
        checked: true,
      },
      {
        id: 11,
        name: "오렌지주스",
        category: "음료",
        price: 4900,
        quantity: 2,
        checked: true,
      },
    ],
  },
];

const conversations: AiConversation[] = [
  {
    id: 1,
    title: "이번 주 식비를 줄이고 싶어",
    preview:
      "냉장고에 있는 재료를 기준으로 필요한 식재료만 골라봤어요.",
    date: "오늘",
  },
  {
    id: 2,
    title: "다이어트 식단 추천해줘",
    preview:
      "일주일 동안 먹을 수 있는 식재료와 간단한 메뉴를 정리했어요.",
    date: "어제",
  },
  {
    id: 3,
    title: "성수에서 장보기",
    preview:
      "현재 위치에서 이동하기 편한 매장을 기준으로 장보기 동선을 만들었어요.",
    date: "8월 16일",
  },
];

const formatPrice = (price: number) =>
  `${price.toLocaleString("ko-KR")}원`;

export default function SavedPage() {
  const [activeTab, setActiveTab] = useState<"cart" | "ai">("cart");

  const [cartGroups, setCartGroups] =
    useState<CartGroup[]>(initialCartGroups);

  const [selectedGroupId, setSelectedGroupId] =
    useState<number | null>(null);

  const selectedGroup = cartGroups.find(
    (group) => group.id === selectedGroupId
  );

  const selectedProducts = useMemo(() => {
    if (!selectedGroup) return [];

    return selectedGroup.products.filter(
      (product) => product.checked
    );
  }, [selectedGroup]);

  const selectedTotal = useMemo(() => {
    return selectedProducts.reduce(
      (sum, product) =>
        sum + product.price * product.quantity,
      0
    );
  }, [selectedProducts]);

  const updateGroup = (
    groupId: number,
    updater: (group: CartGroup) => CartGroup
  ) => {
    setCartGroups((groups) =>
      groups.map((group) =>
        group.id === groupId ? updater(group) : group
      )
    );
  };

  const toggleProduct = (productId: number) => {
    if (!selectedGroupId) return;

    updateGroup(selectedGroupId, (group) => ({
      ...group,
      products: group.products.map((product) =>
        product.id === productId
          ? {
              ...product,
              checked: !product.checked,
            }
          : product
      ),
    }));
  };

  const changeQuantity = (
    productId: number,
    amount: number
  ) => {
    if (!selectedGroupId) return;

    updateGroup(selectedGroupId, (group) => ({
      ...group,
      products: group.products.map((product) =>
        product.id === productId
          ? {
              ...product,
              quantity: Math.max(
                1,
                product.quantity + amount
              ),
            }
          : product
      ),
    }));
  };

  const deleteProduct = (productId: number) => {
    if (!selectedGroupId) return;

    updateGroup(selectedGroupId, (group) => ({
      ...group,
      products: group.products.filter(
        (product) => product.id !== productId
      ),
    }));
  };

  const deleteGroup = (groupId: number) => {
    setCartGroups((groups) =>
      groups.filter((group) => group.id !== groupId)
    );

    setSelectedGroupId(null);
  };

  const goBack = () => {
    setSelectedGroupId(null);
  };

  /*
   * ==========================================
   * 장바구니 상세
   * ==========================================
   */

  if (selectedGroup) {
    return (
      <div className="min-h-screen pb-28">
        {/* Header */}
        <header className="flex items-center gap-3 px-5 pb-5 pt-6">
          <button
            type="button"
            onClick={goBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-lg"
            aria-label="뒤로가기"
          >
            ←
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold">
              {selectedGroup.title}
            </h1>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedGroup.store}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              deleteGroup(selectedGroup.id)
            }
            className="text-xs text-muted-foreground"
          >
            삭제
          </button>
        </header>

        <main className="space-y-6 px-5">
          {/* 동선 */}
          <section>
            <button
              type="button"
              className="flex w-full items-center gap-4 rounded-2xl bg-foreground p-5 text-left text-background"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background/10 text-xl">
                ⌖
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  장보기 동선 보기
                </p>

                <p className="mt-1 text-xs text-background/60">
                  상품 위치를 기준으로 가장 효율적인
                  순서로 안내해요.
                </p>
              </div>

              <span className="text-xl">→</span>
            </button>
          </section>

          {/* 상품 목록 */}
          <section>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="font-semibold">
                  장보기 목록
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  구매할 상품만 체크해주세요.
                </p>
              </div>

              <span className="text-sm text-muted-foreground">
                {selectedGroup.products.length}개
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-card">
              {selectedGroup.products.map(
                (product, index) => (
                  <div
                    key={product.id}
                    className={`p-4 ${
                      index !==
                      selectedGroup.products.length - 1
                        ? "border-b"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* 체크 */}
                      <button
                        type="button"
                        onClick={() =>
                          toggleProduct(product.id)
                        }
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                          product.checked
                            ? "border-foreground bg-foreground text-background"
                            : "border-border"
                        }`}
                        aria-label={`${product.name} 구매 여부`}
                      >
                        {product.checked ? "✓" : ""}
                      </button>

                      {/* 상품 */}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium ${
                            !product.checked
                              ? "text-muted-foreground line-through"
                              : ""
                          }`}
                        >
                          {product.name}
                        </p>

                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {product.category}
                        </p>
                      </div>

                      {/* 삭제 */}
                      <button
                        type="button"
                        onClick={() =>
                          deleteProduct(product.id)
                        }
                        className="text-xs text-muted-foreground/60"
                      >
                        삭제
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between pl-8">
                      {/* 수량 */}
                      <div className="flex h-8 items-center rounded-lg border">
                        <button
                          type="button"
                          onClick={() =>
                            changeQuantity(
                              product.id,
                              -1
                            )
                          }
                          className="h-8 w-8 text-sm text-muted-foreground"
                        >
                          −
                        </button>

                        <span className="w-7 text-center text-xs">
                          {product.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            changeQuantity(
                              product.id,
                              1
                            )
                          }
                          className="h-8 w-8 text-sm"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-sm font-medium">
                        {formatPrice(
                          product.price *
                            product.quantity
                        )}
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>

          {/* 예상 금액 */}
          <section className="rounded-2xl bg-muted p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                선택한 상품
              </span>

              <span className="text-sm font-medium">
                {selectedProducts.length}개
              </span>
            </div>

            <div className="mt-4 flex items-end justify-between">
              <span className="font-medium">
                예상 금액
              </span>

              <span className="text-2xl font-semibold">
                {formatPrice(selectedTotal)}
              </span>
            </div>

            <p className="mt-2 text-right text-[11px] text-muted-foreground">
              실제 판매 가격과 다를 수 있어요.
            </p>
          </section>

          {/* 하단 여백 */}
          <div className="h-4" />
        </main>
      </div>
    );
  }

  /*
   * ==========================================
   * 저장 메인
   * ==========================================
   */

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <header className="px-5 pb-5 pt-7">
        <h1 className="text-2xl font-semibold">
          저장
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          마음에 든 쇼핑 정보와
          <br />
          장보기 목록을 모아두세요.
        </p>
      </header>

      {/* Tab */}
      <div className="sticky top-0 z-10 bg-background px-5">
        <div className="flex border-b">
          <button
            type="button"
            onClick={() => setActiveTab("cart")}
            className={`relative flex-1 py-3 text-sm font-medium ${
              activeTab === "cart"
                ? "text-foreground"
                : "text-muted-foreground"
            }`}
          >
            장바구니

            {activeTab === "cart" && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={`relative flex-1 py-3 text-sm font-medium ${
              activeTab === "ai"
                ? "text-foreground"
                : "text-muted-foreground"
            }`}
          >
            AI 대화

            {activeTab === "ai" && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
            )}
          </button>
        </div>
      </div>

      {activeTab === "cart" ? (
        <main className="space-y-5 px-5 pt-5">
          {/* 상단 정보 */}
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-semibold">
                내 장바구니
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                저장한 장보기 목록
              </p>
            </div>

            <span className="text-xs text-muted-foreground">
              {cartGroups.length}개
            </span>
          </div>

          {/* 그룹 */}
          <div className="space-y-4">
            {cartGroups.map((group) => {
              const checkedProducts =
                group.products.filter(
                  (product) => product.checked
                );

              const total =
                checkedProducts.reduce(
                  (sum, product) =>
                    sum +
                    product.price *
                      product.quantity,
                  0
                );

              return (
                <article
                  key={group.id}
                  className="overflow-hidden rounded-3xl border bg-card"
                >
                  {/* 카드 상단 */}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedGroupId(group.id)
                    }
                    className="w-full p-5 text-left"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold">
                          {group.title}
                        </h3>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {group.description}
                        </p>
                      </div>

                      <span className="text-lg text-muted-foreground">
                        →
                      </span>
                    </div>

                    {/* 상품 미리보기 */}
                    <div className="mt-5 flex gap-2 overflow-hidden">
                      {group.products
                        .slice(0, 4)
                        .map((product) => (
                          <div
                            key={product.id}
                            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-center text-[10px] text-muted-foreground"
                          >
                            {product.name}
                          </div>
                        ))}
                    </div>

                    {/* 정보 */}
                    <div className="mt-5 flex items-end justify-between border-t pt-4">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {checkedProducts.length}
                          개 상품 · {group.store}
                        </p>

                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {group.createdAt} 저장
                        </p>
                      </div>

                      <p className="font-semibold">
                        {formatPrice(total)}
                      </p>
                    </div>
                  </button>

                  {/* 동선 버튼 */}
                  <div className="border-t px-5 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedGroupId(group.id)
                      }
                      className="flex w-full items-center justify-between text-xs font-medium"
                    >
                      <span>
                        ⌖ 매장 동선 확인하기
                      </span>

                      <span>→</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* 안내 */}
          <div className="rounded-2xl bg-muted/60 p-4">
            <p className="text-xs font-medium">
              AI에게 장보기를 부탁해보세요
            </p>

            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              필요한 상품을 추천받고,
              한 번에 장바구니 그룹으로 저장할 수 있어요.
            </p>
          </div>
        </main>
      ) : (
        /*
         * ======================================
         * AI 대화
         * ======================================
         */
        <main className="px-5 pt-5">
          <div className="mb-5">
            <h2 className="font-semibold">
              AI 대화
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              저장해둔 대화를 다시 확인할 수 있어요.
            </p>
          </div>

          <div className="overflow-hidden rounded-3xl border bg-card">
            {conversations.map(
              (conversation, index) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`w-full p-5 text-left ${
                    index !==
                    conversations.length - 1
                      ? "border-b"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm">
                      AI
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium">
                          {conversation.title}
                        </p>

                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {conversation.date}
                        </span>
                      </div>

                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {conversation.preview}
                      </p>
                    </div>

                    <span className="text-muted-foreground">
                      →
                    </span>
                  </div>
                </button>
              )
            )}
          </div>
        </main>
      )}
    </div>
  );
}