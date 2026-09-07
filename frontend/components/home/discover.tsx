"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  fetchPopularProducts,
  formatPrice,
  type HomeProduct,
} from "@/lib/home-data";
import { apiFetch, resolveImageUrl } from "@/lib/api-client";
import { SectionTitle } from "./section-title";

interface PopularityItem {
  skuId: number;
  productName: string;
  imageUrl: string | null;
  purchaserCount: number;
}

type DiscoverProps = {
  onProductClick: (productId: number) => void;
};

export function Discover({
  onProductClick,
}: DiscoverProps) {
  const router = useRouter();
  // ✅ 실제 구매이력 기반 인기상품(GET /api/purchases/popular)로 교체.
  //   로그인 안 했거나 실패하면 검색 결과 기반 목업(fetchPopularProducts)으로 대체.
  const [popularProducts, setPopularProducts] = useState<HomeProduct[]>([]);

  useEffect(() => {
    apiFetch<PopularityItem[]>("/api/purchases/popular?limit=8")
      .then((list) => {
        if (list.length === 0) throw new Error("empty");
        setPopularProducts(
          list.map((p) => ({
            id: p.skuId,
            name: p.productName,
            category: "",
            price: 0,
            image: resolveImageUrl(p.imageUrl) ?? "",
          }))
        );
      })
      .catch(() => fetchPopularProducts().then(setPopularProducts));
  }, []);

  if (popularProducts.length === 0) return null;

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8">
      <SectionTitle
        title="발견해보세요"
        action="더보기"
        onAction={() => router.push("/search")}
      />

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {popularProducts.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() =>
              onProductClick(product.id)
            }
            className="min-w-0 text-left"
          >
            <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
              <img
                src={product.image || undefined}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            </div>

            <p className="mt-2 truncate text-sm font-medium">
              {product.name}
            </p>

            {product.price > 0 && (
              <p className="mt-1 text-sm font-semibold">
                {formatPrice(product.price)}
              </p>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}