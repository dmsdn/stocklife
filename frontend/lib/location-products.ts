// lib/location-products.ts
// ✅ 실제 GET /api/locations/{locationId}/products 연동 — 매대(위치)를 클릭했을 때
//   거기 실제로 진열된 상품 목록을 보여주는 용도. 상품→위치(product-location.ts)의
//   반대 방향.
import { apiFetch } from "./api-client";

export interface LocationProduct {
  skuId: number;
  name: string;
  price: number;
  stock: number;
}

export async function fetchProductsAtLocation(locationId: string): Promise<LocationProduct[]> {
  return apiFetch<LocationProduct[]>(`/api/locations/${encodeURIComponent(locationId)}/products`);
}
