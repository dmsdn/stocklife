"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  TrendingDown,
} from "lucide-react";

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
    <section className="w-full px-4 pt-8 sm:px-6 lg:px-8">
      <SectionTitle
        title="AI가 발견한 것"
        description="OO님의 쇼핑 기록에서 찾았어요."
      />

      <div className="space-y-2">
        {discoveredProducts.map((product) => (
          <DiscoveredItem
            key={product.id}
            product={product}
            onClick={() =>
              onProductClick(product.id)
            }
          />
        ))}
      </div>
    </section>
  );
}

function DiscoveredItem({
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
      className="w-full rounded-sm border border-border p-3.5 text-left"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-sm bg-muted px-2 py-1 text-xs font-medium">
              {product.discount} OFF
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
              {formatPrice(product.price)}
            </span>

            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(product.originalPrice)}
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

        <p className="text-sm leading-5 text-muted-foreground">
          {product.reason}
        </p>
      </div>
    </button>
  );
}