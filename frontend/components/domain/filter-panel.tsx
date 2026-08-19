// components/domain/filter-panel.tsx
// 이전 popup-store-project의 components/search/FilterPanel.tsx를 이식 — 구조·동작은 동일, 색상만 이 프로젝트 토큰으로 교체
// TODO: 카테고리/지역/운영여부 값은 실제 데이터 확정 전 자리표시자로 호출부에서 채워야 함
// ⚠ 별점 탭은 후기·별점 기능 제외 결정과 충돌 — 제거 검토 필요
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Checkbox } from "./checkbox";

export type FilterTab = "카테고리" | "지역" | "운영여부" | "별점";

const RATING_OPTIONS = [
  { label: "4점 이상", value: 4 },
  { label: "3점 이상", value: 3 },
  { label: "2점 이상", value: 2 },
];

const ALL_LABEL = "전체";

export function FilterPanel({
  initialTab,
  categories,
  regions,
  statuses,
  selectedCategories,
  selectedRegions,
  selectedStatuses,
  selectedMinRating,
  onApply,
  onClose,
}: {
  initialTab: FilterTab;
  categories: string[];
  regions: string[];
  statuses: readonly string[];
  selectedCategories: string[];
  selectedRegions: string[];
  selectedStatuses: string[];
  selectedMinRating: number | null;
  onApply: (next: {
    categories: string[];
    regions: string[];
    statuses: string[];
    minRating: number | null;
  }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<FilterTab>(initialTab);
  const [draftCategories, setDraftCategories] = useState(selectedCategories);
  const [draftRegions, setDraftRegions] = useState(selectedRegions);
  const [draftStatuses, setDraftStatuses] = useState(selectedStatuses);
  const [draftMinRating, setDraftMinRating] = useState(selectedMinRating);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const toggleWithAll = (list: string[], setList: (v: string[]) => void, value: string) => {
    if (value === ALL_LABEL) {
      setList([]);
      return;
    }
    toggle(list, setList, value);
  };

  const selectedChips = [
    ...draftCategories.map((v) => ({ group: "카테고리" as FilterTab, value: v })),
    ...draftRegions.map((v) => ({ group: "지역" as FilterTab, value: v })),
    ...draftStatuses.map((v) => ({ group: "운영여부" as FilterTab, value: v })),
    ...(draftMinRating ? [{ group: "별점" as FilterTab, value: `${draftMinRating}점 이상` }] : []),
  ];

  const removeChip = (group: FilterTab, value: string) => {
    if (group === "카테고리") setDraftCategories(draftCategories.filter((v) => v !== value));
    else if (group === "지역") setDraftRegions(draftRegions.filter((v) => v !== value));
    else if (group === "운영여부") setDraftStatuses(draftStatuses.filter((v) => v !== value));
    else setDraftMinRating(null);
  };

  const handleReset = () => {
    setDraftCategories([]);
    setDraftRegions([]);
    setDraftStatuses([]);
    setDraftMinRating(null);
  };

  const handleApply = () => {
    onApply({
      categories: draftCategories,
      regions: draftRegions,
      statuses: draftStatuses,
      minRating: draftMinRating,
    });
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-scrim)] md:items-center"
      onClick={onClose}
    >
      <div
        className="flex h-[65vh] w-full flex-col rounded-t-2xl bg-card md:h-[520px] md:max-w-md md:rounded-2xl"
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
            {(["카테고리", "지역", "운영여부", "별점"] as FilterTab[]).map((t) => (
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

        {/* 탭 내용 - 체크박스 다중 선택 (별점만 단일 선택) */}
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
          {tab === "지역" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2.5 text-base font-medium">
                <Checkbox
                  checked={draftRegions.length === 0}
                  onChange={() => toggleWithAll(draftRegions, setDraftRegions, ALL_LABEL)}
                />
                {ALL_LABEL}
              </label>
              {regions.map((r) => (
                <label key={r} className="flex items-center gap-2.5 text-base font-medium">
                  <Checkbox
                    checked={draftRegions.includes(r)}
                    onChange={() => toggleWithAll(draftRegions, setDraftRegions, r)}
                  />
                  {r}
                </label>
              ))}
            </div>
          )}
          {tab === "운영여부" && (
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
          {tab === "별점" && (
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2.5 text-base font-medium">
                <Checkbox checked={draftMinRating === null} onChange={() => setDraftMinRating(null)} />
                {ALL_LABEL}
              </label>
              {RATING_OPTIONS.map(({ label, value }) => (
                <label key={value} className="flex items-center gap-2.5 text-base font-medium">
                  <Checkbox
                    checked={draftMinRating === value}
                    onChange={() => setDraftMinRating(draftMinRating === value ? null : value)}
                  />
                  {label}
                </label>
              ))}
            </div>
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
