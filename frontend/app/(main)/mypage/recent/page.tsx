"use client";
import { useEffect, useState } from "react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { readRecentViews, type RecentView } from "@/lib/recent-views";

export default function RecentPage() {
  const [items, setItems] = useState<RecentView[]>([]);

  useEffect(() => {
    setItems(readRecentViews());
  }, []);

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <SubpageHeader title="최근 본" />

      {items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">최근 본 상품이 없어요.</p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.skuId}>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} className="mb-2 aspect-square w-full rounded-sm object-cover" />
            ) : (
              <div className="mb-2 aspect-square rounded-sm border border-border bg-muted" />
            )}
            <p className="truncate text-sm">{item.name}</p>
            <p className="text-sm font-medium">{item.price.toLocaleString()}원</p>
          </div>
        ))}
      </div>
    </div>
  );
}
