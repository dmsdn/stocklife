// app/(main)/search/page.tsx
// ✅ 목업 대신 실제 GET /api/products/search 연동. finalPriceKrw/discountKrw/onPromo 등
//   실제 할인 필드를 그대로 씁니다. 재고여부는 백엔드 응답에 없어서(단종 여부만 있음)
//   "재고 있음/품절" 대신 "일반/단종"으로 필터를 맞췄습니다.
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RiArrowLeftSLine, RiSearchLine, RiCloseLine, RiBookmarkLine, RiCheckLine, RiMapPinLine } from "@remixicon/react";
import { FilterPanel, type FilterTab } from "@/components/domain/filter-panel";
import { SaveToListDialog } from "@/components/domain/save-to-list-dialog";
import { ProductDetailDialog } from "@/components/domain/product-detail-dialog";
import { LocationMapDialog } from "@/components/domain/location-map-dialog";
import { addProductToCartGroup } from "@/lib/cart-storage";
import { addSearchHistory, readSearchHistory, removeSearchHistory } from "@/lib/search-history";
import { apiFetch } from "@/lib/api-client";
import { fetchInventoryBatch, pickLocation, formatLocationText, type InventoryItem } from "@/lib/product-location";
import { fetchRealFloorMap } from "@/lib/map-config";

const STATUSES = ["일반", "단종"] as const;
const PRICE_MIN = 0;
// ⚠ 예전엔 20,000원으로 막아뒀는데, 실제 상품 중 이보다 비싼 것도 있을 수 있어서
//   넉넉하게 올렸습니다. 정확한 "가장 비싼 상품 가격"은 백엔드에 최대값 조회 API가
//   없어서 알 수 없어요 — 이 값(50만원) 이상인 상품이 있으면 필터에서 최대값을
//   더 올려야 합니다. 직접 입력 칸으로도 이 범위 밖 값을 넣을 수 있게 해뒀습니다.
const PRICE_MAX = 500000;

interface Product {
  skuId: number;
  name: string;
  category: string;
  categoryL1: string;
  brand: string;
  priceKrw: number;
  onPromo: boolean;
  discountKrw: number;
  finalPriceKrw: number;
  unit: string;
  discontinued: boolean;
}

function SearchPageInner() {
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState("");
  const [aiMode, setAiMode] = useState(false);
  // ⚠ localStorage는 서버에 없는 값이라, useState(() => readSearchHistory())처럼 렌더 중
  //   바로 읽으면 서버(빈 배열)와 클라이언트 첫 렌더(실제 캐시)가 달라 hydration mismatch가
  //   납니다. 항상 []로 시작하고, 마운트 후 useEffect에서만 채웁니다.
  const [recent, setRecent] = useState<string[]>([]);
  const [inputFocused, setInputFocused] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);

  const [savePickerProduct, setSavePickerProduct] = useState<Product | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [detailProductId, setDetailProductId] = useState<number | null>(null);

  // ✅ 상품 목록 카드에 매대 위치 표시 + 클릭 시 지도로 보기
  const [productLocations, setProductLocations] = useState<Map<number, InventoryItem>>(new Map());
  const [locationMapSku, setLocationMapSku] = useState<number | null>(null);

  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("카테고리");
  const [filters, setFilters] = useState<{
    categories: string[];
    statuses: string[];
    priceRange: [number, number];
  }>({ categories: [], statuses: [], priceRange: [PRICE_MIN, PRICE_MAX] });

  useEffect(() => {
    setRecent(readSearchHistory());
  }, []);

  useEffect(() => {
    const fromQuery = searchParams.get("productId");
    if (fromQuery) setDetailProductId(Number(fromQuery));

    // ✅ 홈 화면 "최근 검색어" 칩에서 ?keyword=로 들어오면 바로 그 검색어로 실행
    const keywordFromQuery = searchParams.get("keyword");
    if (keywordFromQuery) {
      setKeyword(keywordFromQuery);
      runSearch(keywordFromQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const runSearch = async (kw?: string) => {
    setLoading(true);
    try {
      // ✅ AI 자연어 검색 모드면 실제 POST /api/ai/search로 보냅니다.
      if (aiMode && kw) {
        const res = await apiFetch<{ results?: Product[] } | Product[]>("/api/ai/search", {
          method: "POST",
          body: JSON.stringify({ query: kw }),
        });
        const list = Array.isArray(res) ? res : res.results ?? [];
        setProducts(list);
        setLoading(false);
        return;
      }

      const qs = new URLSearchParams();
      if (kw) qs.set("keyword", kw);
      if (filters.categories[0]) qs.set("categoryL1", filters.categories[0]);
      if (filters.priceRange[1] !== PRICE_MAX) qs.set("maxPrice", String(filters.priceRange[1]));
      const res = await apiFetch<Product[]>(`/api/products/search?${qs.toString()}`, { auth: false });
      setProducts(res);
      if (categories.length === 0) {
        setCategories([...new Set(res.map((p) => p.categoryL1).filter(Boolean))]);
      }
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSearch(); // 초기 전체 목록 + 카테고리 목록 확보용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(() => {
    return products.filter((p) => {
      const matchesStatus =
        filters.statuses.length === 0 ||
        (filters.statuses.includes("단종") && p.discontinued) ||
        (filters.statuses.includes("일반") && !p.discontinued);
      const matchesPriceMin = p.finalPriceKrw >= filters.priceRange[0];
      return matchesStatus && matchesPriceMin;
    });
  }, [products, filters]);

  // ✅ 화면에 보이는 상품들의 매대 위치를 한 번에 조회 (배치 API 재사용)
  useEffect(() => {
    if (results.length === 0) return;
    let cancelled = false;
    const skuIds = results.map((p) => p.skuId);

    fetchInventoryBatch(skuIds).then(async (invMap) => {
      const picked = new Map<number, InventoryItem>();
      const floors = new Set<number>();
      invMap.forEach((items, skuId) => {
        const loc = pickLocation(items);
        if (loc) {
          picked.set(skuId, loc);
          floors.add(loc.floorNo);
        }
      });
      await Promise.all(Array.from(floors).map((f) => fetchRealFloorMap(f)));
      if (!cancelled) setProductLocations(picked);
    });

    return () => {
      cancelled = true;
    };
  }, [results]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyword.trim();
    if (trimmed) {
      addSearchHistory(trimmed);
      setRecent(readSearchHistory());
    }
    setInputFocused(false);
    runSearch(trimmed);
  };

  const handleRecentClick = (word: string) => {
    setKeyword(word);
    addSearchHistory(word);
    setRecent(readSearchHistory());
    setInputFocused(false);
    runSearch(word);
  };

  const handleRemoveRecent = (word: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    removeSearchHistory(word);
    setRecent(readSearchHistory());
  };

  const handleBlur = () => {
    blurTimeout.current = setTimeout(() => setInputFocused(false), 150);
  };
  const handleFocus = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    setInputFocused(true);
  };

  // ✅ 여러 리스트에 동시에 담을 수 있게 됨(SaveToListDialog가 groupId 배열을 넘겨줌).
  //   "저장됐다"는 상태를 리스트별로 안 나누고, 그냥 "방금 눌렀다"는 잠깐의 확인 표시로만 씁니다
  //   (여러 리스트 중 어디에 담겼는지를 하트 하나로 표현하는 게 애매해서, 꽉 찬 하트 대신
  //   체크 아이콘이 잠깐 떴다가 사라지는 방식으로 바꿨습니다).
  const handleSaveSelect = (groupIds: number[]) => {
    if (!savePickerProduct) return;
    groupIds.forEach((groupId) => {
      addProductToCartGroup(groupId, {
        id: savePickerProduct.skuId,
        name: savePickerProduct.name,
        category: savePickerProduct.categoryL1,
        price: savePickerProduct.finalPriceKrw,
      });
    });
    setSavedIds((prev) => new Set(prev).add(savePickerProduct.skuId));
    setTimeout(() => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(savePickerProduct.skuId);
        return next;
      });
    }, 1500);
  };

  const priceActive = filters.priceRange[0] !== PRICE_MIN || filters.priceRange[1] !== PRICE_MAX;

  return (
    <div className="mx-auto max-w-md p-4 md:max-w-5xl md:p-8">
      {/* ✅ 실제 POST /api/ai/search 연동 — 켜면 자연어로 검색됨 */}
      <button
        type="button"
        onClick={() => setAiMode((v) => !v)}
        className={`mb-2 rounded-full border px-3 py-1 text-xs ${aiMode ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
      >
        {aiMode ? "AI 검색 켜짐" : "AI로 검색하기"}
      </button>

      <form onSubmit={handleSearch} className="relative mb-4 flex items-center gap-3">
        <Link href="/">
          <RiArrowLeftSLine size={24} />
        </Link>
        <div className="flex flex-1 items-center gap-2 rounded-sm border border-border px-3 py-2 text-sm">
          <RiSearchLine size={24} className="text-muted-foreground" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="상품을 검색해보세요"
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>

        {inputFocused && recent.length > 0 && (
          <div className="absolute left-8 right-0 top-full z-20 mt-2 rounded-sm border border-border bg-card p-3 shadow-sm">
            <p className="mb-2 text-xs text-muted-foreground">최근 검색어</p>
            <div className="flex flex-wrap gap-2">
              {recent.map((word) => (
                <button
                  key={word}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleRecentClick(word)}
                  className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs"
                >
                  {word}
                  <RiCloseLine size={24} onMouseDown={(e) => handleRemoveRecent(word, e)} />
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      <div className="mb-2 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => { setFilterTab("카테고리"); setFilterOpen(true); }}
          className={`rounded-full border px-3 py-1.5 ${filters.categories.length ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          카테고리
        </button>
        <button
          type="button"
          onClick={() => { setFilterTab("재고여부"); setFilterOpen(true); }}
          className={`rounded-full border px-3 py-1.5 ${filters.statuses.length ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          상태
        </button>
        <button
          type="button"
          onClick={() => { setFilterTab("가격"); setFilterOpen(true); }}
          className={`rounded-full border px-3 py-1.5 ${priceActive ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          가격
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{loading ? "불러오는 중..." : `${results.length}개 결과`}</span>
      </div>

      <div className="divide-y divide-border md:grid md:grid-cols-3 md:gap-x-6 md:divide-y-0 lg:grid-cols-4">
        {results.map((product) => (
          <div key={product.skuId} className="flex gap-3 py-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDetailProductId(product.skuId)}
              onKeyDown={(e) => e.key === "Enter" && setDetailProductId(product.skuId)}
              className="flex flex-1 cursor-pointer gap-3 text-left"
            >
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-xs text-muted-foreground">
                IMG
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <p className="truncate text-sm">{product.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{product.categoryL1} · {product.unit}</p>
                  {product.discontinued && <p className="text-xs text-danger">단종</p>}
                </div>

                <div>
                  <p className={`truncate text-base font-semibold ${product.discontinued ? "text-muted-foreground/50" : ""}`}>
                    {product.onPromo && <span className="mr-1 text-danger">할인</span>}
                    {product.finalPriceKrw.toLocaleString()}원
                  </p>

                  {productLocations.has(product.skuId) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocationMapSku(product.skuId);
                      }}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      <RiMapPinLine size={14} className="shrink-0" />
                      {formatLocationText(productLocations.get(product.skuId)!)}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={product.discontinued}
              onClick={() => setSavePickerProduct(product)}
              aria-label="저장하기"
              className="flex h-8 w-8 shrink-0 items-center justify-center self-start text-muted-foreground disabled:opacity-30"
            >
              {savedIds.has(product.skuId) ? (
                <RiCheckLine size={24} className="text-success" />
              ) : (
                <RiBookmarkLine size={24} />
              )}
            </button>
          </div>
        ))}
      </div>

      {!loading && results.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">검색 결과가 없어요.</p>
      )}

      {filterOpen && (
        <FilterPanel
          initialTab={filterTab}
          categories={categories}
          statuses={STATUSES}
          selectedCategories={filters.categories}
          selectedStatuses={filters.statuses}
          selectedPriceRange={filters.priceRange}
          onApply={(next) => { setFilters(next); runSearch(keyword); }}
          onClose={() => setFilterOpen(false)}
        />
      )}

      <SaveToListDialog open={!!savePickerProduct} onClose={() => setSavePickerProduct(null)} onSelect={handleSaveSelect} />
      <ProductDetailDialog productId={detailProductId} onClose={() => setDetailProductId(null)} />

      {locationMapSku !== null && productLocations.has(locationMapSku) && (
        <LocationMapDialog
          open
          onClose={() => setLocationMapSku(null)}
          floorNo={productLocations.get(locationMapSku)!.floorNo}
          x={productLocations.get(locationMapSku)!.x}
          y={productLocations.get(locationMapSku)!.y}
          productName={results.find((p) => p.skuId === locationMapSku)?.name ?? ""}
          price={results.find((p) => p.skuId === locationMapSku)?.finalPriceKrw ?? 0}
        />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-4" />}>
      <SearchPageInner />
    </Suspense>
  );
}
