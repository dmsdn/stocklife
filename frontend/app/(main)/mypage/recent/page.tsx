"use client";
import { useEffect, useState } from "react";
import { SubpageHeader } from "@/components/domain/subpage-header";
import { resolveImageUrl } from "@/lib/api-client";
import { readRecentViews, type RecentView } from "@/lib/recent-views";

export default function RecentPage() {
  const [items, setItems] = useState<RecentView[]>([]);

  useEffect(() => {
    // ✅ 버그 수정(요청 — "GET /img/200002.webp 404") — lib/recent-views.ts에 저장된
    //   imageUrl은 백엔드가 준 상대경로("/img/200002.webp") 그대로라서, resolveImageUrl()
    //   없이 그냥 <img src=...>에 넣으면 브라우저가 이걸 프론트(localhost:3000) 기준으로
    //   풀어버려서 404가 났습니다(원래는 백엔드 주소를 앞에 붙여야 함). 여기서 한 번
    //   해석해서 채워둠 — resolveImageUrl은 이미 완전한 URL이면 그대로 두고 통과시키니
    //   중복 호출돼도 안전합니다.
    setItems(readRecentViews().map((item) => ({ ...item, imageUrl: resolveImageUrl(item.imageUrl) ?? null })));
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
