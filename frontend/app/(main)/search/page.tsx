// app/(main)/search/page.tsx
// ⚠ 백엔드 ProductSearchResponse에는 discountPercent/originalPrice/unitPrice가 없고
//   priceKrw(정가) 하나뿐입니다. 할인 관련 표시는 아직 백엔드에 그 데이터 자체가 없어서
//   지금은 originalPrice=finalPrice=priceKrw, discountPercent=0으로 채워 "할인 없음"
//   상태로 보이게만 해뒀습니다. 실제 할인 데이터가 추가되면 이 매핑만 고치면 됩니다.
// ⚠ 검색창이 원래 그냥 장식용 텍스트였어서, 실제로 검색어를 입력받는 폼으로 바꿨습니다.
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Search as SearchIcon, ShoppingCart } from "lucide-react";
import { ProductCard } from "@/components/domain/product-card";
import { FilterPanel, type FilterTab } from "@/components/domain/filter-panel";
import { trackConsumerEvent } from "@/lib/consumer-events";
import { apiFetch } from "@/lib/api-client";

// TODO: 카테고리/지역/운영여부 목록은 실제 데이터 확정 전 자리표시자
const CATEGORIES = ["신선식품", "유제품", "생활용품", "냉동식품"];
const REGIONS: string[] = [];
const STATUSES = ["재고 있음", "품절"] as const;

interface BackendProduct {
  skuId: number;
  name: string;
  category: string;
  brand: string;
  priceKrw: number;
  stockQuantity: number;
  inStock: boolean;
}

export default function SearchPage() {
  const [keyword, setKeyword] = useState("");
  const [products, setProducts] = useState<BackendProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("카테고리");
  const [filters, setFilters] = useState({
    categories: [] as string[],
    regions: [] as string[],
    statuses: [] as string[],
    minRating: null as number | null,
  });

  const openFilter = (tab: FilterTab) => {
    setFilterTab(tab);
    setFilterOpen(true);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setSearched(true);
    trackConsumerEvent({ event_type: "SEARCH", meta: { keyword } });
    try {
      const results = await apiFetch<BackendProduct[]>(
        `/api/products/search?keyword=${encodeURIComponent(keyword)}`,
        { auth: false }
      );
      setProducts(results);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (skuId: number) => {
    try {
      await apiFetch("/api/cart", {
        method: "POST",
        body: JSON.stringify({ skuId, quantity: 1 }),
      });
      trackConsumerEvent({ event_type: "CART_ADD", sku_id: skuId });
    } catch {
      // TODO: 로그인 안 된 상태에서 담기 시도하면 401 — 로그인 유도 처리 필요
    }
  };

  return (
    <div className="mx-auto max-w-md p-4 md:max-w-5xl md:p-8">
      <form onSubmit={handleSearch} className="mb-4 flex items-center gap-3">
        <Link href="/">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <SearchIcon size={16} className="text-muted-foreground" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="상품을 검색해보세요"
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      </form>

      <div className="mb-2 flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => openFilter("카테고리")}
          className="rounded-full border border-border px-3 py-1.5 text-muted-foreground"
        >
          필터
        </button>
        <button
          type="button"
          onClick={() => openFilter("운영여부")}
          className="rounded-full border border-border px-3 py-1.5 text-muted-foreground"
        >
          필터
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{loading ? "검색 중..." : searched ? `${products.length}개 결과` : ""}</span>
        <span className="text-muted-foreground">랭킹순</span>
      </div>

      <div className="divide-y divide-border md:grid md:grid-cols-3 md:gap-x-6 md:divide-y-0">
        {products.map((product) => (
          <ProductCard
            key={product.skuId}
            skuId={product.skuId}
            name={product.name}
            originalPrice={product.priceKrw}
            discountPercent={0}
            finalPrice={product.priceKrw}
            unitPrice={product.priceKrw}
            onAdd={product.inStock ? () => handleAdd(product.skuId) : undefined}
          />
        ))}
      </div>

      {searched && !loading && products.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">검색 결과가 없어요.</p>
      )}

      <Link href="/cart" className="mt-4 flex items-center justify-end gap-1 text-sm">
        <ShoppingCart size={16} />
        장바구니
      </Link>

      {filterOpen && (
        <FilterPanel
          initialTab={filterTab}
          categories={CATEGORIES}
          regions={REGIONS}
          statuses={STATUSES}
          selectedCategories={filters.categories}
          selectedRegions={filters.regions}
          selectedStatuses={filters.statuses}
          selectedMinRating={filters.minRating}
          onApply={setFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}
