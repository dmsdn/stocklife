"use client";

import {
  ChevronRight,
  ShoppingCart,
} from "lucide-react";

import { SectionTitle } from "./section-title";

type CartSummaryProps = {
  onClick: () => void;
  /** ✅ 하드코딩된 "상품 7개 · 예상 38,200원 · 70%" 대신 실제 담은 리스트(lib/cart-storage.ts) 기준 */
  itemCount: number;
  estimatedPrice: number;
  checkedRatio: number; // 0~100
};

export function CartSummary({
  onClick,
  itemCount,
  estimatedPrice,
  checkedRatio,
}: CartSummaryProps) {
  if (itemCount === 0) return null;

  return (
    <section className="w-full px-4 pt-8 sm:px-6 lg:px-8">
      <SectionTitle
        title="나의 장바구니"
        action="더보기"
        onAction={onClick}
      />

      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-sm border border-border p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-muted">
            <ShoppingCart size={24} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">
              담은 리스트
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              상품 {itemCount}개 · 예상 {estimatedPrice.toLocaleString()}원
            </p>
          </div>

          <ChevronRight
            size={24}
            className="shrink-0 text-muted-foreground"
          />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              담기 완료율
            </span>

            <span className="text-sm font-medium">
              {checkedRatio}%
            </span>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
            <div className="h-full rounded-sm bg-foreground" style={{ width: `${checkedRatio}%` }} />
          </div>
        </div>
      </button>
    </section>
  );
}
