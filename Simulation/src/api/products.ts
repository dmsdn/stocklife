// storeflow-backend(/api/locations/{locationId}/products)와 실제로 연동된 상품 조회.
// 매대(location) 안에 어떤 상품이 있는지 보여주는 스페이스바 팝업용 데이터.

import type { LocationInfo, ProductInfo } from '../game/types';

interface LocationProductDto {
  skuId: number;
  name: string;
  price: number;
  stock: number;
}

export async function fetchProductsAtLocation(
  location: LocationInfo,
  _zoneLabel: string
): Promise<ProductInfo[]> {
  const res = await fetch(`/api/locations/${encodeURIComponent(location.locationId)}/products`);
  if (!res.ok) {
    throw new Error(`GET /api/locations/${location.locationId}/products 실패 (${res.status})`);
  }
  const items: LocationProductDto[] = await res.json();
  return items.map((it) => {
    const overlay = stockOverlay.get(overlayKey(location.locationId, it.skuId)) ?? 0;
    return {
      skuId: it.skuId,
      name: it.name,
      price: it.price,
      stock: Math.max(0, it.stock + overlay),
    };
  });
}

// 구매/환불 시 화면에 즉시 반영하기 위한 세션 내 오버레이. 실제 차감은 백엔드가
// /api/orders/checkout 처리 중에 하고(스키마_변경규칙.md 동작계약), 여기서는
// 다음에 이 매대를 다시 열었을 때 서버가 아직 안 돌려준 변화를 화면에서만 먼저 보여준다.
// 새로고침하면 서버 값(fetchProductsAtLocation)으로 다시 맞춰진다.
const stockOverlay = new Map<string, number>();
function overlayKey(locationId: string, skuId: number) {
  return `${locationId}::${skuId}`;
}

export function adjustStock(locationId: string, skuId: number, delta: number) {
  const key = overlayKey(locationId, skuId);
  stockOverlay.set(key, (stockOverlay.get(key) ?? 0) + delta);
}
