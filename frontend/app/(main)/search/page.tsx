// app/(main)/search/page.tsx
// ✅ 목업 대신 실제 GET /api/products/search 연동. finalPriceKrw/discountKrw/onPromo 등
//   실제 할인 필드를 그대로 씁니다. 재고여부는 백엔드 응답에 없어서(단종 여부만 있음)
//   "재고 있음/품절" 대신 "일반/단종"으로 필터를 맞췄습니다.
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RiSearchLine, RiCloseLine, RiBookmarkLine, RiCheckLine, RiMapPinLine, RiFilterLine } from "@remixicon/react";
import { FilterPanel, type FilterTab } from "@/components/domain/filter-panel";
import { SaveToListDialog } from "@/components/domain/save-to-list-dialog";
import { ScrollToTopButton, FloatingBackButton } from "@/components/domain/scroll-to-top-button";
import { LocationMapDialog } from "@/components/domain/location-map-dialog";
import { addProductToCartGroup } from "@/lib/cart-storage";
import { addSearchHistory, readSearchHistory, removeSearchHistory } from "@/lib/search-history";
import { apiFetch, resolveImageUrl } from "@/lib/api-client";
import { fetchInventoryBatch, pickLocation, formatLocationText, type InventoryItem } from "@/lib/product-location";
import { fetchRealFloorMap } from "@/lib/map-config";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";

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
  imageUrl?: string | null;
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState("");
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

  // ✅ 상품 목록 카드에 매대 위치 표시 + 클릭 시 지도로 보기
  const [productLocations, setProductLocations] = useState<Map<number, InventoryItem>>(new Map());
  const [locationMapSku, setLocationMapSku] = useState<number | null>(null);

  const [filterOpen, setFilterOpen] = useState(false);
  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  useEffect(() => {
    setBottomBarHidden(filterOpen);
    return () => setBottomBarHidden(false);
  }, [filterOpen, setBottomBarHidden]);

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
    // ✅ 수정(요청) — 상품 상세가 모달→페이지(/product/[skuId])로 바뀌면서, 예전처럼
    //   이 검색 화면이 ?productId=로 모달을 대신 열어줄 필요가 없어짐 — 그 링크로 들어오면
    //   그냥 상세 페이지로 보내줌(혹시 남아있는 옛 링크 대비).
    const fromQuery = searchParams.get("productId");
    if (fromQuery) {
      router.replace(`/product/${fromQuery}`);
      return;
    }

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
      const qs = new URLSearchParams();
      if (kw) qs.set("keyword", kw);
      if (filters.categories[0]) qs.set("categoryL1", filters.categories[0]);
      if (filters.priceRange[1] !== PRICE_MAX) qs.set("maxPrice", String(filters.priceRange[1]));
      const res = await apiFetch<Product[]>(`/api/products/search?${qs.toString()}`, { auth: false });
      const resolved = res.map((p) => ({ ...p, imageUrl: resolveImageUrl(p.imageUrl) ?? null }));
      setProducts(resolved);
      if (categories.length === 0) {
        setCategories([...new Set(resolved.map((p) => p.categoryL1).filter(Boolean))]);
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

  // ✅ 신규(요청) — "상품 목록을 너무 한 번에 다 불러오느라 오래 걸리는 것 같다"에 대한
  //   대응: 데이터 자체는 한 번에 받아오지만(백엔드가 이미 그렇게 응답), 화면에 그리는
  //   건 처음 20개만 하고 나머지는 스크롤해서 아래쪽이 보일 때 그때그때 늘림 — DOM
  //   노드 수를 줄여서 초기 렌더링 체감 속도를 높임(진짜 "다음 페이지 요청"이 아니라
  //   이미 받은 데이터를 늦게 그리는 것뿐이라 백엔드 변경 없이 바로 적용됨).
  const [visibleCount, setVisibleCount] = useState(20);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(20);
  }, [results]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((v) => v + 20);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleCount, results.length]);

  // ✅ 화면에 보이는 상품들의 매대 위치를 한 번에 조회 (배치 API 재사용)
  // ✅ 수정(2026-09) — results 전체(검색 결과 전부, 필터 없을 땐 카탈로그 수천 개)를
  //   skuIds로 넘기고 있었음. GET 쿼리스트링이 수만 자까지 길어져서 브라우저/서버가
  //   요청 자체를 거부(net::ERR_FAILED)했던 원인. 실제 화면에 렌더링되는 만큼만
  //   (results.slice(0, visibleCount), 무한 스크롤 페이지네이션과 동일 범위) 조회하도록.
  useEffect(() => {
    if (results.length === 0) return;
    let cancelled = false;
    const skuIds = results.slice(0, visibleCount).map((p) => p.skuId);

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
  }, [results, visibleCount]);

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
    Promise.all(
      groupIds.map((groupId) =>
        addProductToCartGroup(groupId, {
          id: savePickerProduct.skuId,
          name: savePickerProduct.name,
          category: savePickerProduct.categoryL1,
          price: savePickerProduct.finalPriceKrw,
        })
      )
    )
      .then(() => {
        setSavedIds((prev) => new Set(prev).add(savePickerProduct.skuId));
        setTimeout(() => {
          setSavedIds((prev) => {
            const next = new Set(prev);
            next.delete(savePickerProduct.skuId);
            return next;
          });
        }, 1500);
      })
      .catch(() => {
        // ✅ 실패해도 조용히 묻히지 않게 — 최소한 콘솔에는 남기고, 저장 확인 표시(체크
        //   아이콘)는 실패했으면 안 뜨게(성공 처리 블록을 안 타므로 자동으로 안 뜸).
        console.error("리스트에 담기 실패");
        alert("리스트에 담지 못했어요. 다시 시도해주세요.");
      });
  };

  const priceActive = filters.priceRange[0] !== PRICE_MIN || filters.priceRange[1] !== PRICE_MAX;

  return (
    <div className="mx-auto max-w-md p-4 md:max-w-5xl md:p-8">
      <FloatingBackButton onClick={() => router.push("/")} />
      <form onSubmit={handleSearch} className="relative mb-4 flex items-center gap-3 pl-12">
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

      {/* ✅ 수정(요청) — "카테고리/상태/가격 버튼 3개를 필터 아이콘 버튼 하나로 묶고,
          선택된 필터는 그 옆에 같은 줄·같은 높이로". 필터 아이콘을 누르면 그동안 마지막으로
          봤던 탭(filterTab)이 열림 — 처음엔 "카테고리" 탭부터. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          aria-label="필터"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
            filters.categories.length > 0 || filters.statuses.length > 0 || priceActive
              ? "border-primary text-primary"
              : "border-border text-muted-foreground"
          }`}
        >
          <RiFilterLine size={16} />
        </button>

        {/* ✅ 선택된 필터 칩 — 진한 보더+텍스트로 "선택됨" 표시, X로 개별 해제. 필터
            버튼과 같은 줄, 같은 높이(h-8). */}
        {filters.categories.map((c) => (
          <button
            key={`cat-${c}`}
            type="button"
            onClick={() => {
              const next = { ...filters, categories: filters.categories.filter((x) => x !== c) };
              setFilters(next);
              runSearch(keyword);
            }}
            className="flex h-8 items-center gap-1 rounded-full border border-primary bg-primary/5 px-2.5 font-medium text-primary"
          >
            {c}
            <RiCloseLine size={16} />
          </button>
        ))}
        {filters.statuses.map((s) => (
          <button
            key={`status-${s}`}
            type="button"
            onClick={() => {
              const next = { ...filters, statuses: filters.statuses.filter((x) => x !== s) };
              setFilters(next);
              runSearch(keyword);
            }}
            className="flex h-8 items-center gap-1 rounded-full border border-primary bg-primary/5 px-2.5 font-medium text-primary"
          >
            {s}
            <RiCloseLine size={16} />
          </button>
        ))}
        {priceActive && (
          <button
            type="button"
            onClick={() => {
              const next = { ...filters, priceRange: [PRICE_MIN, PRICE_MAX] as [number, number] };
              setFilters(next);
              runSearch(keyword);
            }}
            className="flex h-8 items-center gap-1 rounded-full border border-primary bg-primary/5 px-2.5 font-medium text-primary"
          >
            {filters.priceRange[0].toLocaleString()}원~{filters.priceRange[1].toLocaleString()}원
            <RiCloseLine size={16} />
          </button>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{loading ? "불러오는 중..." : `${results.length}개 결과`}</span>
      </div>

      <div className="divide-y divide-border md:grid md:grid-cols-3 md:gap-x-6 md:divide-y-0 lg:grid-cols-4">
        {results.slice(0, visibleCount).map((product) => {
          const discountPercent =
            product.onPromo && product.priceKrw > 0
              ? Math.round((product.discountKrw / product.priceKrw) * 100)
              : 0;
          return (
          <div key={product.skuId} className="flex gap-3 py-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/product/${product.skuId}`)}
              onKeyDown={(e) => e.key === "Enter" && router.push(`/product/${product.skuId}`)}
              className="flex flex-1 cursor-pointer gap-3 text-left"
            >
              {/* ✅ 수정 — 목업 "IMG" 텍스트 박스 대신 실제 상품 이미지(imageUrl), 크기도
                  h-20(80px) → h-28(112px)로 키움. */}
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                {product.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <p className="truncate text-sm">{product.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{product.categoryL1} · {product.unit}</p>
                  {product.discontinued && <p className="text-xs text-danger">단종</p>}
                </div>

                <div>
                  {/* ✅ 수정 — 할인 중이면 원래 가격(취소선)+할인율도 같이 보여줌. 예전엔
                      "할인" 글자만 있고 정작 원래 가격/몇 % 할인인지는 안 보였음. */}
                  {product.onPromo && !product.discontinued && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground line-through">
                        {product.priceKrw.toLocaleString()}원
                      </span>
                      <span className="text-xs font-semibold text-danger">{discountPercent}%</span>
                    </div>
                  )}
                  <p className={`truncate text-base font-semibold ${product.discontinued ? "text-muted-foreground/50" : ""}`}>
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
          );
        })}
      </div>

      {/* ✅ 신규(요청) — 결과가 많을 때 한 번에 다 그리지 않고, 스크롤로 이 지점이
          보이면 그때 더 렌더링(20개씩 늘림). IntersectionObserver로 감지. */}
      {visibleCount < results.length && (
        <div ref={loadMoreRef} className="py-4 text-center text-xs text-muted-foreground">
          더 불러오는 중...
        </div>
      )}

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

      {locationMapSku !== null && productLocations.has(locationMapSku) && (
        <LocationMapDialog
          skuId={locationMapSku}
          open
          onClose={() => setLocationMapSku(null)}
          floorNo={productLocations.get(locationMapSku)!.floorNo}
          x={productLocations.get(locationMapSku)!.x}
          y={productLocations.get(locationMapSku)!.y}
          productName={results.find((p) => p.skuId === locationMapSku)?.name ?? ""}
          price={results.find((p) => p.skuId === locationMapSku)?.finalPriceKrw ?? 0}
        />
      )}

      <ScrollToTopButton />
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
