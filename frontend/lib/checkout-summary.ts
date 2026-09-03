// lib/checkout-summary.ts
// ✅ 신규 — 결제 완료 화면(/checkout-complete)에 방금 결제 내용을 전달하는 용도.
//   회원은 실제 POST /api/orders/checkout 응답에 orderId가 있어서 그걸로 다시
//   GET /api/orders/{orderId}를 조회하면 되지만(진짜 전자영수증 연결 가능), 비회원은
//   결제 자체가 서버에 남지 않으므로(백엔드 체크아웃 API가 로그인 전용) orderId가 없다.
//   그래서 비회원용으로는 결제 직후 화면에 뿌릴 요약만 sessionStorage에 잠깐 담아둔다.
"use client";

const KEY = "storeflow_last_guest_checkout";

export interface CheckoutSummary {
  totalAmount: number;
  itemCount: number;
}

export function writeLastCheckout(summary: CheckoutSummary) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(summary));
}

export function readLastCheckout(): CheckoutSummary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CheckoutSummary) : null;
  } catch {
    return null;
  }
}
