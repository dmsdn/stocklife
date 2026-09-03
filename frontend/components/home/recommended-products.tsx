"use client";

import { RiBookmarkLine, RiSparkling2Line } from "@remixicon/react";

import {
  formatPrice,
  type RecommendedProduct,
} from "@/lib/home-data";
import { SectionTitle } from "./section-title";

type RecommendedProductsProps = {
  products: RecommendedProduct[];
  onProductClick: (productId: number) => void;
  onSave: (product: RecommendedProduct) => void;
  onMore: () => void;
};

export function RecommendedProducts({
  products,
  onProductClick,
  onSave,
  onMore,
}: RecommendedProductsProps) {
  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <SectionTitle
        title="브리핑에 맞춰 추천해요"
      />

      {/* ✅ 화면이 넓어질수록 열이 늘어나서 카드 하나의 최대 크기가 커지지 않게 함
          (기존엔 grid-cols-2 고정이라 넓은 화면에서 카드 하나가 지나치게 커졌음) */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {products.map((product) => (
          <RecommendedProductCard
            key={product.id}
            product={product}
            onProductClick={() =>
              onProductClick(product.id)
            }
            onSave={() => onSave(product)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onMore}
        className="mt-6 flex h-10 w-full items-center justify-center gap-1 rounded-sm border border-border text-sm font-medium"
      >
        추천 상품 더보기
        <span aria-hidden>›</span>
      </button>
    </section>
  );
}

function RecommendedProductCard({
  product,
  onProductClick,
  onSave,
}: {
  product: RecommendedProduct;
  onProductClick: () => void;
  onSave: () => void;
}) {
  return (
    // ✅ 카드 자체에도 최대 폭을 걸어서, 컬럼 수가 안 늘어나는 중간 화면폭에서도 안전하게 캡
    <div className="mx-auto w-full min-w-0 max-w-[220px]">
      <div className="relative">
        <button
          type="button"
          onClick={onProductClick}
          className="block w-full text-left"
        >
          <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
            <img
              src={product.image || undefined}
              alt={product.name}
              className="h-full w-full object-cover"
            />

            <div className="absolute left-2 top-2 max-w-[calc(100%-40px)] truncate rounded-full bg-background/90 px-2 py-1 text-xs font-medium">
              {product.badge}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onSave}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90"
          aria-label={`${product.name} 장바구니 저장`}
        >
          <RiBookmarkLine size={24} />
        </button>
      </div>

      <button
        type="button"
        onClick={onProductClick}
        className="mt-2 block w-full text-left"
      >
        <p className="truncate text-base font-medium">
          {product.name}
        </p>

        <p className="mt-1 text-base font-semibold">
          {formatPrice(product.price)}
        </p>
      </button>

      <div className="mt-1.5 flex items-start gap-1">
        <RiSparkling2Line
          size={14}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />

        <p className="line-clamp-1 text-xs text-muted-foreground">
          {product.reason}
        </p>
      </div>
    </div>
  );
}
