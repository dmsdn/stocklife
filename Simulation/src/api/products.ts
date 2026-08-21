// 매대(location) 안에 어떤 상품이 있는지 보여주는 스페이스바 팝업용 데이터.
// products_seed.sql/스키마와 실제로 연동된 게 아니라, location_id로부터 결정적으로
// 만들어낸 더미 상품 목록이다 (같은 매대는 항상 같은 목록을 보여줌, 새로고침해도 안 바뀜).
// 백엔드 연동 시 이 파일의 fetchProductsAtLocation 하나만 실제
// GET /api/locations/{locationId}/products 호출로 바꾸면 된다.

import type { LocationInfo, ProductInfo } from '../game/types';

// 문자열 해시 → 결정적 난수 시드로 사용
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 구매/환불로 재고가 늘고 주는 걸 흉내내기 위한 세션 내 오버레이.
// 진짜 DB가 아니라 메모리에만 있는 값이라 새로고침하면 초기 재고로 되돌아간다.
const stockOverlay = new Map<string, number>();
function overlayKey(locationId: string, skuId: number) {
  return `${locationId}::${skuId}`;
}

// 구매 시 -qty, 환불 시 +qty로 호출한다.
export function adjustStock(locationId: string, skuId: number, delta: number) {
  const key = overlayKey(locationId, skuId);
  stockOverlay.set(key, (stockOverlay.get(key) ?? 0) + delta);
}

export async function fetchProductsAtLocation(
  location: LocationInfo,
  zoneLabel: string
): Promise<ProductInfo[]> {
  // TODO(백엔드 연동): fetch(`/api/locations/${location.locationId}/products`)
  const rand = mulberry32(hashSeed(location.locationId));
  const count = 3 + Math.floor(rand() * 4); // 3~6개
  const items: ProductInfo[] = [];
  for (let i = 1; i <= count; i++) {
    const skuId = hashSeed(`${location.locationId}-${i}`) % 100000;
    const baseStock = Math.floor(rand() * 20);
    const overlay = stockOverlay.get(overlayKey(location.locationId, skuId)) ?? 0;
    items.push({
      skuId,
      name: `${zoneLabel} 상품 ${i}`,
      price: 1000 + Math.floor(rand() * 30) * 500,
      stock: Math.max(0, baseStock + overlay),
    });
  }
  return Promise.resolve(items);
}
