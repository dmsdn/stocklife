"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ProductCard } from "@/components/domain/product-card";

// TODO: 백엔드 연동 전 목업 데이터
const initialItems = [
  { skuId: 1, name: "상품 이름", originalPrice: 29999, discountPercent: 80, finalPrice: 10000, unitPrice: 999 },
  { skuId: 2, name: "상품 이름", originalPrice: 29999, discountPercent: 80, finalPrice: 10000, unitPrice: 999 },
  { skuId: 3, name: "상품 이름", originalPrice: 29999, discountPercent: 80, finalPrice: 10000, unitPrice: 999 },
];

export default function WishlistPage() {
  const [items] = useState(initialItems);
  const [checked, setChecked] = useState<Record<number, boolean>>(
    Object.fromEntries(initialItems.map((item) => [item.skuId, false]))
  );

  const total = items
    .filter((item) => checked[item.skuId])
    .reduce((sum, item) => sum + item.finalPrice, 0);

  return (
    <div className="mx-auto max-w-md p-4 md:max-w-3xl md:p-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/mypage">
          <ChevronLeft size={20} />
        </Link>
        <p className="text-base">찜</p>
      </div>

      <div className="mb-2 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-4 w-4 rounded-full border border-border" />
        <span>필터</span>
        <span>필터</span>
      </div>

      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{items.length}개 결과</span>
        <span className="text-muted-foreground">랭킹순</span>
      </div>

      <div className="divide-y divide-border">
        {items.map((item) => (
          <ProductCard
            key={item.skuId}
            {...item}
            variant="simple"
            checked={checked[item.skuId]}
            onCheckedChange={(v) => setChecked((prev) => ({ ...prev, [item.skuId]: v }))}
          />
        ))}
      </div>

      <p className="mt-4 text-right text-base font-medium">총 {total.toLocaleString()}원</p>
    </div>
  );
}
