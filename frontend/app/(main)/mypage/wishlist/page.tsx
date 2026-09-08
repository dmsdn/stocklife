// app/(main)/mypage/wishlist/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RiArrowLeftSLine, RiDeleteBin6Line } from "@remixicon/react";
import { apiFetch, resolveImageUrl } from "@/lib/api-client";

interface WishlistItem {
  skuId: number;
  name: string;
  brand: string;
  priceKrw: number;
  imageUrl: string | null;
  addedAt: string;
}

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<WishlistItem[]>("/api/wishlist")
      .then((list) => setItems(list.map((i) => ({ ...i, imageUrl: resolveImageUrl(i.imageUrl) ?? null }))))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (skuId: number) => {
    setItems((prev) => prev.filter((i) => i.skuId !== skuId));
    await apiFetch(`/api/wishlist/${skuId}`, { method: "DELETE" });
  };

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/mypage">
          <RiArrowLeftSLine size={24} />
        </Link>
        <p className="text-base">찜</p>
      </div>

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>}
      {!loading && items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">찜한 상품이 없어요.</p>
      )}

      <div className="divide-y divide-border">
        {items.map((item) => (
          <div key={item.skuId} className="flex gap-3 py-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-xs text-muted-foreground">
              IMG
            </div>
            <div className="flex flex-1 items-center justify-between">
              <div>
                <p className="text-sm">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.brand}</p>
                <p className="text-sm font-medium">{item.priceKrw.toLocaleString()}원</p>
              </div>
              <button
                type="button"
                aria-label="찜 삭제"
                onClick={() => handleRemove(item.skuId)}
                className="text-muted-foreground"
              >
                <RiDeleteBin6Line size={24} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
