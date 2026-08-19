// components/domain/filter-panel.tsx
// ✅ "지역"·"별점" 탭 제거 (지역은 안 쓰기로 했고, 별점은 후기 기능 자체를 빼기로 한 결정과
//   맞춰서 제거). 대신 "가격" 탭(이중 슬라이더, 1,000원 단위)을 추가했습니다.
// ✅ 상단 모서리를 rounded-2xl → rounded-md로 변경.
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Checkbox } from "./checkbox";
import { PriceRangeSlider } from "./price-range-slider";

export type FilterTab = "카테고리" | "재고여부" | "가격";

const ALL_LABEL = "전체";
const PRICE_MIN = 0;
const PRICE_MAX = 20000;

export function FilterPanel({
  initialTab,
  categories,
  statuses,
  selectedCategories,
  selectedStatuses,
  selectedPriceRange,
  onApply,
  onClose,
}: {
  initialTab: FilterTab;
  categories: string[];
  statuses: readonly string[];
  selectedCategories: string[];
  selectedStatuses: string[];
  selectedPriceRange: [number, number];
  onApply: (next: { categories: string[]; statuses: string[]; priceRange: [number, number] }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<FilterTab>(initialTab);
  const [draftCategories, setDraftCategories] = useState(selectedCategories);
  const [draftStatuses, setDraftStatuses] = useState(selectedStatuses);
  const [draftPriceRange, setDraftPriceRange] = useState<[number, number]>(selectedPriceRange);

  const toggleWithAll = (list: string[], setList: (v: string[]) => void, value: string) => {
    if (value === ALL_LABEL) {
      setList([]);
      return;
    }
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const priceChanged = draftPriceRange[0] !== PRICE_MIN || draftPriceRange[1] !== PRICE_MAX;

  const selectedChips = [
    ...draftCategories.map((v) => ({ group: "카테고리" as FilterTab, value: v })),
    ...draftStatuses.map((v) => ({ group: "재고여부" as FilterTab, value: v })),
    ...(priceChanged
      ? [{ group: "가격" as FilterTab, value: `${draftPriceRange[0].toLocaleString()}~${draftPriceRange[1].toLocaleString()}원` }]
      : []),
  ];

  const removeChip = (group: FilterTab, value: string) => {
    if (group === "카테고리") setDraftCategories(draftCategories.filter((v) => v !== value));
    else if (group === "재고여부") setDraftStatuses(draftStatuses.filter((v) => v !== value));
    else setDraftPriceRange([PRICE_MIN, PRICE_MAX]);
  };

  const handleReset = () => {
    setDraftCategories([]);
    setDraftStatuses([]);
    setDraftPriceRange([PRICE_MIN, PRICE_MAX]);
  };

  const handleApply = () => {
    onApply({ categories: draftCategories, statuses: draftStatuses, priceRange: draftPriceRange });
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-scrim)] md:items-center"
      onClick={onClose}
    >
      <div
        className="flex h-[65vh] w-full flex-col rounded-t-md bg-card md:h-[520px] md:max-w-md md:rounded-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5">
          <h2 className="mb-4 text-lg font-bold">필터</h2>

          {selectedChips.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {selectedChips.map(({ group, value }) => (
                <span
                  key={`${group}-${value}`}
                  className="flex items-center gap-1 rounded-full border border-primary py-1.5 pl-3 pr-2 text-sm text-primary"
                >
                  {value}
                  <button
                    type="button"
                    onClick={() => removeChip(group, value)}
                    aria-label={`${value} 제거`}
                    className="text-muted-foreground"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-5 border-b border-border">
            {(["카테고리", "재고여부", "가격"] as FilterTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`pb-3 text-base ${
                  tab === t ? "border-b-2 border-primary font-semibold text-primary" : "text-muted-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "카테고리" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2.5 text-base font-medium">
                <Checkbox
                  checked={draftCategories.length === 0}
                  onChange={() => toggleWithAll(draftCategories, setDraftCategories, ALL_LABEL)}
                />
                {ALL_LABEL}
              </label>
              {categories.map((c) => (
                <label key={c} className="flex items-center gap-2.5 text-base font-medium">
                  <Checkbox
                    checked={draftCategories.includes(c)}
                    onChange={() => toggleWithAll(draftCategories, setDraftCategories, c)}
                  />
                  {c}
                </label>
              ))}
            </div>
          )}

          {tab === "재고여부" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2.5 text-base font-medium">
                <Checkbox
                  checked={draftStatuses.length === 0}
                  onChange={() => toggleWithAll(draftStatuses, setDraftStatuses, ALL_LABEL)}
                />
                {ALL_LABEL}
              </label>
              {statuses.map((s) => (
                <label key={s} className="flex items-center gap-2.5 text-base font-medium">
                  <Checkbox
                    checked={draftStatuses.includes(s)}
                    onChange={() => toggleWithAll(draftStatuses, setDraftStatuses, s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          )}

          {tab === "가격" && (
            <PriceRangeSlider
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={1000}
              value={draftPriceRange}
              onChange={setDraftPriceRange}
            />
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border p-5">
          <button
            type="button"
            onClick={handleReset}
            className="flex-none rounded-full border border-border px-5 py-3 text-base font-medium text-foreground"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 rounded-full bg-primary py-3 text-base font-medium text-primary-foreground"
          >
            적용하기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
