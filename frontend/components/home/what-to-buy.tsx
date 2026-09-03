// components/home/what-to-buy.tsx
// ✅ 신규 — "뭐사지" 섹션. 자주 사요 / 추천 / 할인 / 인기 4개 탭으로 구성.
//   전부 이미 실제 API로 연동돼 있던 데이터를 재사용합니다(fetchFrequentProducts,
//   fetchRecommendedProducts, fetchDiscoveredProducts, fetchPopularProducts) — 새 mock을
//   만들지 않았습니다. "자주 사요"만 로그인 사용자의 실제 구매 이력이 필요한 개인화 데이터라,
//   비로그인이거나 구매 이력이 없으면 빈 상태 문구를 보여주고 목업으로 대체하지 않습니다.
"use client";

import { useEffect, useState } from "react";
import { RiBookmarkLine } from "@remixicon/react";

import {
  fetchFrequentProducts,
  fetchRecommendedProducts,
  fetchDiscoveredProducts,
  fetchPopularProducts,
  formatPrice,
  type HomeProduct,
  type RecommendedProduct,
} from "@/lib/home-data";
import { isLoggedIn } from "@/lib/api-client";

type TabKey = "frequent" | "recommended" | "discount" | "popular";

const TABS: { key: TabKey; label: string }[] = [
  { key: "frequent", label: "자주 사요" },
  { key: "recommended", label: "추천" },
  { key: "discount", label: "할인" },
  { key: "popular", label: "인기" },
];

type WhatToBuyProduct = HomeProduct & { badge?: string };

interface WhatToBuyProps {
  onProductClick: (productId: number) => void;
  onSave: (product: RecommendedProduct) => void;
}

export function WhatToBuy({ onProductClick, onSave }: WhatToBuyProps) {
  const [tab, setTab] = useState<TabKey>("recommended");
  const [loggedIn, setLoggedIn] = useState(false);
  const [frequent, setFrequent] = useState<WhatToBuyProduct[]>([]);
  const [recommended, setRecommended] = useState<WhatToBuyProduct[]>([]);
  const [discount, setDiscount] = useState<WhatToBuyProduct[]>([]);
  const [popular, setPopular] = useState<WhatToBuyProduct[]>([]);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
    fetchFrequentProducts().then(setFrequent);
    fetchRecommendedProducts().then((list) => setRecommended(list));
    fetchDiscoveredProducts().then((list) =>
      setDiscount(
        list.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          image: p.image,
          badge: `${p.discount} OFF`,
        }))
      )
    );
    fetchPopularProducts().then(setPopular);
  }, []);

  const productsByTab: Record<TabKey, WhatToBuyProduct[]> = {
    frequent,
    recommended,
    discount,
    popular,
  };

  const activeProducts = productsByTab[tab];

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <div className="mb-3 flex items-center gap-1.5">
        <img src="/icons/liv-full.svg" alt="" aria-hidden="true" className="h-5 w-5" />
        <h2 className="text-lg font-semibold">리브 추천</h2>
      </div>

      <div className="flex gap-2 overflow-x-hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              t.key === tab
                ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                : "shrink-0 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "frequent" && !loggedIn ? (
        <p className="mt-6 rounded-sm border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          로그인하면 자주 사는 상품을 보여드려요.
        </p>
      ) : activeProducts.length === 0 ? (
        <p className="mt-6 rounded-sm border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          {tab === "frequent" ? "아직 구매 이력이 없어요." : "지금은 보여드릴 상품이 없어요."}
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {activeProducts.map((product) => (
            <WhatToBuyCard
              key={product.id}
              product={product}
              onProductClick={() => onProductClick(product.id)}
              onSave={() =>
                onSave({
                  id: product.id,
                  name: product.name,
                  category: product.category,
                  price: product.price,
                  image: product.image,
                  reason: "",
                  badge: product.badge ?? "",
                })
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function WhatToBuyCard({
  product,
  onProductClick,
  onSave,
}: {
  product: WhatToBuyProduct;
  onProductClick: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[220px]">
      <div className="relative">
        <button type="button" onClick={onProductClick} className="block w-full text-left">
          <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
            <img
              src={product.image || undefined}
              alt={product.name}
              className="h-full w-full object-cover"
            />

            {product.badge && (
              <div className="absolute left-2 top-2 max-w-[calc(100%-40px)] truncate rounded-full bg-background/90 px-2 py-1 text-xs font-medium">
                {product.badge}
              </div>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onSave}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90"
          aria-label={`${product.name} 저장`}
        >
          <RiBookmarkLine size={20} />
        </button>
      </div>

      <button type="button" onClick={onProductClick} className="mt-2 block w-full text-left">
        <span className="flex items-center gap-1 text-xs text-brand">
          <img src="/icons/liv-full.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" />
          인기상품
        </span>
        <p className="mt-0.5 truncate text-sm">{product.name}</p>
        <p className="mt-0.5 text-sm font-semibold">{formatPrice(product.price)}</p>
      </button>
    </div>
  );
}
