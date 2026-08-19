// app/(main)/mypage/wishlist/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

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
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (skuId: number) => {
    setItems((prev) => prev.filter((i) => i.skuId !== skuId));
    await apiFetch(`/api/wishlist/${skuId}`, { method: "DELETE" });
  };

  return (
    <div className="mx-auto max-w-md p-4 md:max-w-3xl md:p-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/mypage">
          <ChevronLeft size={20} />
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
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
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
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
