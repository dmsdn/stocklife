// lib/ai-proxy.ts
// ✅ 실제 GET /api/ai/products/{skuId}/alternatives 연동. 백엔드가 Agent 서버로 그대로
//   릴레이하는 구조라, 응답 형태는 Agent 쪽 구현에 따라 달라질 수 있어 방어적으로 파싱합니다.
"use client";

import { apiFetch } from "./api-client";

export interface AlternativeProduct {
  skuId: number;
  name?: string;
  productName?: string;
  imageUrl?: string | null;
}

export async function getAlternatives(skuId: number): Promise<AlternativeProduct[]> {
  try {
    const res = await apiFetch<{ alternatives?: AlternativeProduct[] } | AlternativeProduct[]>(
      `/api/ai/products/${skuId}/alternatives`
    );
    return Array.isArray(res) ? res : res.alternatives ?? [];
  } catch {
    return [];
  }
}

export interface PopularityItem {
  skuId: number;
  productName: string;
  totalQty: number;
  purchaserCount: number;
}

/** ✅ 실제 GET /api/purchases/compare 연동 — 현재 상품 vs 대체상품들의 실제 인기도 비교 */
export async function compareProducts(skuIds: number[]): Promise<PopularityItem[]> {
  if (skuIds.length === 0) return [];
  try {
    const qs = skuIds.map((id) => `skuIds=${id}`).join("&");
    return await apiFetch<PopularityItem[]>(`/api/purchases/compare?${qs}`);
  } catch {
    return [];
  }
}
