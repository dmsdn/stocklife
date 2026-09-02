// components/home/ai-discovered.tsx
// ✅ 홈 리디자인(2026-08, 6차) — "발견해보세요"(이미지 위·텍스트 아래 그리드 카드)와
//   역할을 확실히 구분하기 위해, 이 섹션은 이미지+내용을 가로로 배치한 리스트 행 한 줄
//   구성으로 바꿨습니다. 그리드가 아니라 위에서 아래로 쌓이는 리스트이고, 각 행 자체가
//   가로 스크롤 없이 한 줄에 이미지·뱃지·이름·가격을 전부 보여줍니다.
"use client";

import { useEffect, useState } from "react";
import { RiSparkling2Line } from "@remixicon/react";

import {
  fetchDiscoveredProducts,
  formatPrice,
  type DiscoveredProduct,
} from "@/lib/home-data";
import { SectionTitle } from "./section-title";

type AiDiscoveredProps = {
  onProductClick: (productId: number) => void;
};

export function AiDiscovered({
  onProductClick,
}: AiDiscoveredProps) {
  // ✅ 실제 GET /api/products/search?onPromo=true 연동 (목업 배열 대신)
  const [discoveredProducts, setDiscoveredProducts] = useState<DiscoveredProduct[]>([]);

  useEffect(() => {
    fetchDiscoveredProducts()
      .then(setDiscoveredProducts)
      .catch(() => setDiscoveredProducts([]));
  }, []);

  if (discoveredProducts.length === 0) return null;

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <SectionTitle
        title="AI가 발견한 것"
        description="OO님의 쇼핑 기록에서 찾았어요."
      />

      <div className="space-y-2">
        {discoveredProducts.map((product) => (
          <DiscoveredRow
            key={product.id}
            product={product}
            onClick={() => onProductClick(product.id)}
          />
        ))}
      </div>
    </section>
  );
}

function DiscoveredRow({
  product,
  onClick,
}: {
  product: DiscoveredProduct;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left"
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        <img
          src={product.image || undefined}
          alt={product.name}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <RiSparkling2Line size={14} className="shrink-0" />
          AI 발견
        </div>

        <p className="mt-1 truncate text-sm font-medium">
          {product.name}
        </p>

        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-sm font-bold">{product.discount} OFF</span>
          <span className="text-base font-semibold">{formatPrice(product.price)}</span>
          <span className="text-xs text-muted-foreground line-through">
            {formatPrice(product.originalPrice)}
          </span>
        </div>
      </div>
    </button>
  );
}
