// lib/checkout-draft.ts
"use client";

export interface CheckoutDraft {
  groupId: number;
  scannedSkuIds: number[];
  createdAt: string;
}

const KEY = "storeflow_checkout_draft";

/** 스캔한 품목을 명시해야 서버가 checked 상품 전체로 결제 대상을 넓히지 않는다. */
export function buildCheckoutUrl(groupId: number, skuIds: number[], pointsToUse: number): string {
  const ids = [...new Set(skuIds)];
  if (!Number.isInteger(groupId) || groupId <= 0 || ids.length === 0 || ids.length > 100 ||
      ids.some((id) => !Number.isInteger(id) || id <= 0) ||
      !Number.isInteger(pointsToUse) || pointsToUse < 0) {
    throw new Error("결제할 목록과 스캔한 상품을 확인해 주세요.");
  }
  const query = new URLSearchParams({ groupId: String(groupId), pointsToUse: String(pointsToUse) });
  ids.forEach((id) => query.append("skuIds", String(id)));
  return `/api/orders/checkout?${query}`;
}

export function writeCheckoutDraft(draft: CheckoutDraft) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(draft));
}

export function readCheckoutDraft(): CheckoutDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CheckoutDraft) : null;
  } catch {
    return null;
  }
}

export function clearCheckoutDraft() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}
