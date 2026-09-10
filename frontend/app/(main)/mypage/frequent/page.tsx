// app/(main)/mypage/frequent/page.tsx
// ✅ 신규(버그 수정 — "자주 구매한 상품 404") — 마이페이지 메뉴(app/(main)/mypage/page.tsx)에
//   "/mypage/frequent"로 가는 링크는 이미 있었는데 정작 이 페이지 파일 자체가 없어서
//   404였습니다. lib/home-data.ts의 fetchFrequentProducts()(홈 화면 "뭐사지" 섹션의
//   "자주 사요" 탭이 이미 쓰던 함수 — GET /api/orders/frequent 기반)를 그대로 재사용.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RiArrowLeftSLine } from "@remixicon/react";
import { fetchFrequentProducts, formatPrice, type HomeProduct } from "@/lib/home-data";
import { isLoggedIn } from "@/lib/api-client";

export default function FrequentProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<HomeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(true);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
    fetchFrequentProducts()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-lg p-4 sm:max-w-xl md:max-w-3xl md:p-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/mypage">
          <RiArrowLeftSLine size={24} />
        </Link>
        <p className="text-base">자주 구매한 상품</p>
      </div>

      {loading && <p className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</p>}

      {!loading && !loggedIn && (
        <p className="py-16 text-center text-sm text-muted-foreground">로그인하면 자주 구매한 상품을 보여드려요.</p>
      )}

      {!loading && loggedIn && products.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">아직 구매 이력이 없어요.</p>
      )}

      {!loading && products.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => router.push(`/product/${product.id}`)}
              className="min-w-0 text-left"
            >
              <div className="aspect-square overflow-hidden rounded-[14px] bg-gradient-to-b from-[#d8d8d8] to-card-border">
                {product.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <p className="mt-2 truncate text-sm">{product.name}</p>
              <p className="mt-0.5 text-base font-medium">{formatPrice(product.price)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
