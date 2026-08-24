"use client";

import { ChevronRight } from "lucide-react";

import {
  formatPrice,
  popularProducts,
} from "@/lib/home-data";
import { SectionTitle } from "./section-title";

type DiscoverProps = {
  onProductClick: (productId: number) => void;
};

export function Discover({
  onProductClick,
}: DiscoverProps) {
  return (
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