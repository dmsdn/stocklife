// app/(main)/search/page.tsx
// ✅ 검색바 포커스하면 최근 검색어가 바로 아래에 뜹니다(검색 결과 유무와 무관).
// ✅ 필터에 가격(1,000원 단위 이중 슬라이더) 추가, 카테고리/재고여부/가격 전부 실제 필터링에 반영.
// ✅ 하트 = 담기 = 저장, 전부 같은 동작입니다. 누르면 어느 리스트에 담을지 고르고 그 리스트로
//   들어갑니다. 별도 "담기" 버튼과 "담았어요" 상태는 없앴습니다.
"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Search as SearchIcon, X, Heart } from "lucide-react";
import { FilterPanel, type FilterTab } from "@/components/domain/filter-panel";
import { SaveToListDialog } from "@/components/domain/save-to-list-dialog";
import { searchMockProducts, MOCK_CATEGORIES, type MockProduct } from "@/lib/mock-products";
import { addProductToCartGroup } from "@/lib/cart-storage";
import { addSearchHistory, readSearchHistory, removeSearchHistory } from "@/lib/search-history";

const STATUSES = ["재고 있음", "품절"] as const;
const PRICE_MIN = 0;
const PRICE_MAX = 20000;

export default function SearchPage() {
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readSearchHistory());
  const [inputFocused, setInputFocused] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [savePickerProduct, setSavePickerProduct] = useState<MockProduct | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("카테고리");
  const [filters, setFilters] = useState<{
    categories: string[];
    statuses: string[];
    priceRange: [number, number];
  }>({
    categories: [],
    statuses: [],
    priceRange: [PRICE_MIN, PRICE_MAX],
  });

  const openFilter = (tab: FilterTab) => {
    setFilterTab(tab);
    setFilterOpen(true);
  };

  const onlyInStock = filters.statuses.includes("재고 있음") && !filters.statuses.includes("품절");
  const priceActive = filters.priceRange[0] !== PRICE_MIN || filters.priceRange[1] !== PRICE_MAX;

  const results = useMemo(
    () =>
      searchMockProducts({
        keyword: submittedKeyword,
        categories: filters.categories,
        onlyInStock,
        minPrice: filters.priceRange[0],
        maxPrice: filters.priceRange[1],
      }),
    [submittedKeyword, filters, onlyInStock]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyword.trim();
    setSubmittedKeyword(trimmed);
    if (trimmed) {
      addSearchHistory(trimmed);
      setRecent(readSearchHistory());
    }
    setInputFocused(false);
  };

  const handleRecentClick = (word: string) => {
    setKeyword(word);
    setSubmittedKeyword(word);
    addSearchHistory(word);
    setRecent(readSearchHistory());
    setInputFocused(false);
  };

  const handleRemoveRecent = (word: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    removeSearchHistory(word);
    setRecent(readSearchHistory());
  };

  // blur가 클릭보다 먼저 발생해서 목록이 사라지는 걸 막기 위해 살짝 지연
  const handleBlur = () => {
    blurTimeout.current = setTimeout(() => setInputFocused(false), 150);
  };
  const handleFocus = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    setInputFocused(true);
  };

  const handleSaveSelect = (groupId: number) => {
    if (!savePickerProduct) return;
    addProductToCartGroup(groupId, {
      id: savePickerProduct.id,
      name: savePickerProduct.name,
      category: savePickerProduct.category,
      price: savePickerProduct.price,
    });
    setSavedIds((prev) => new Set(prev).add(savePickerProduct.id));
  };

  return (
    <div className="mx-auto max-w-md p-4 md:max-w-5xl md:p-8">
      <form onSubmit={handleSearch} className="relative mb-4 flex items-center gap-3">
        <Link href="/">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <SearchIcon size={16} className="text-muted-foreground" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="상품을 검색해보세요"
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* 검색창 포커스하면 결과 상태와 무관하게 바로 아래에 뜨는 최근 검색어 */}
        {inputFocused && recent.length > 0 && (
          <div className="absolute left-8 right-0 top-full z-20 mt-2 rounded-md border border-border bg-card p-3 shadow-sm">
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
                  <X size={12} onMouseDown={(e) => handleRemoveRecent(word, e)} />
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      <div className="mb-2 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => openFilter("카테고리")}
          className={`rounded-full border px-3 py-1.5 ${filters.categories.length ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          카테고리
        </button>
        <button
          type="button"
          onClick={() => openFilter("재고여부")}
          className={`rounded-full border px-3 py-1.5 ${filters.statuses.length ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          재고여부
        </button>
        <button
          type="button"
          onClick={() => openFilter("가격")}
          className={`rounded-full border px-3 py-1.5 ${priceActive ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          가격
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{results.length}개 결과</span>
        <span className="text-muted-foreground">랭킹순</span>
      </div>

      <div className="divide-y divide-border md:grid md:grid-cols-3 md:gap-x-6 md:divide-y-0">
        {results.map((product) => (
          <div key={product.id} className="flex gap-3 py-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
              IMG
            </div>
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <p className="text-sm">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {product.category} · {product.unit}
                </p>
                {!product.inStock && <p className="text-xs text-danger">품절</p>}
              </div>
              <p className="text-base font-semibold">{product.price.toLocaleString()}원</p>
            </div>
            <button
              type="button"
              disabled={!product.inStock}
              onClick={() => setSavePickerProduct(product)}
              aria-label="저장하기"
              className="flex h-8 w-8 shrink-0 items-center justify-center self-start text-muted-foreground disabled:opacity-30"
            >
              <Heart size={20} fill={savedIds.has(product.id) ? "currentColor" : "none"} />
            </button>
          </div>
        ))}
      </div>

      {results.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">검색 결과가 없어요.</p>
      )}

      {filterOpen && (
        <FilterPanel
          initialTab={filterTab}
          categories={MOCK_CATEGORIES}
          statuses={STATUSES}
          selectedCategories={filters.categories}
          selectedStatuses={filters.statuses}
          selectedPriceRange={filters.priceRange}
          onApply={(next) => setFilters(next)}
          onClose={() => setFilterOpen(false)}
        />
      )}

      <SaveToListDialog
        open={!!savePickerProduct}
        onClose={() => setSavePickerProduct(null)}
        onSelect={handleSaveSelect}
      />
    </div>
  );
}
