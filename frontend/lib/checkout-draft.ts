// lib/checkout-draft.ts
"use client";

export interface CheckoutDraft {
  groupId: number;
  scannedSkuIds: number[];
  createdAt: string;
}

const KEY = "storeflow_checkout_draft";

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
