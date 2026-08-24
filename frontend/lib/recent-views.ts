// lib/recent-views.ts
// ✅ 백엔드에 "최근 본 상품 조회" API가 없어서, VIEW 이벤트(서버 전송용)와는 별개로
//   search-history.ts와 같은 방식으로 브라우저에 직접 저장합니다. 상품상세를 열 때
//   기록하고, 화면에 보여줄 정보(이름/가격/이미지)도 그때 같이 저장해서 재조회가 필요 없습니다.
"use client";

export interface RecentView {
  skuId: number;
  name: string;
  price: number;
  imageUrl: string | null;
  viewedAt: number;
}

const KEY = "storeflow_recent_views";
const MAX_ITEMS = 30;

function canUseStorage() {
  return typeof window !== "undefined";
}

export function readRecentViews(): RecentView[] {
  if (!canUseStorage()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addRecentView(item: Omit<RecentView, "viewedAt">) {
  if (!canUseStorage()) return;
  const existing = readRecentViews().filter((v) => v.skuId !== item.skuId);
  const next = [{ ...item, viewedAt: Date.now() }, ...existing].slice(0, MAX_ITEMS);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}
