"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import {
  fetchPopularProducts,
  formatPrice,
  type HomeProduct,
} from "@/lib/home-data";
import { SectionTitle } from "./section-title";

type DiscoverProps = {
  onProductClick: (productId: number) => void;
};

export function Discover({
  onProductClick,
}: DiscoverProps) {
  const router = useRouter();
  // ✅ 실제 GET /api/products/search 연동, 실패/빈 결과면 목업으로 자동 대체.
  // ⚠ "인기순" 정렬 API가 따로 없어서, 검색 결과 앞쪽 8개를 그대로 씁니다.
  const [popularProducts, setPopularProducts] = useState<HomeProduct[]>([]);

  useEffect(() => {
    fetchPopularProducts().then(setPopularProducts);
  }, []);

  if (popularProducts.length === 0) return null;

  return (
    <section className="w-full pt-10">
      <div className="px-4 sm:px-6 lg:px-8">
        <SectionTitle
          title="발견해보세요"
          action="더보기"
          onAction={() => router.push("/search")}
        />
      </div>

      <div className="w-full overflow-x-auto scrollbar-hide">
        <div className="flex w-max gap-3 px-4 pb-1 sm:px-6 lg:px-8">
          {popularProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() =>
                onProductClick(product.id)
              }
              className="w-[140px] shrink-0 text-left"
            >
              <div className="relative aspect-square overflow-hidden rounded-sm bg-muted">
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              </div>

              <p className="mt-2 truncate text-base font-medium">
                {product.name}
              </p>

              <p className="mt-1 text-base font-semibold">
                {formatPrice(product.price)}
              </p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}