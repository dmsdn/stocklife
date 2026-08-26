// Agent/sim/out/world_seed.sql + Agent/catalog/out/products_seed.csv에서 생성된 실제 상품 좌표/상품 정보.
// Simulation 내부에서 임의 SKU/더미 상품을 만들지 않는다.

import type { LocationInfo, ProductInfo, ProductPosition } from '../game/types';
import agentProductsRaw from '../data/products-agent.json';

const agentProducts = agentProductsRaw as ProductPosition[];

// 같은 매대 셀(x,y)에 level이 다른 여러 상품이 있을 수 있으므로 좌표 단위로 묶는다.
const productsByCell = new Map<string, ProductPosition[]>();
for (const product of agentProducts) {
  const key = `${product.floor}:${product.x}:${product.y}`;
  const arr = productsByCell.get(key);
  if (arr) arr.push(product);
  else productsByCell.set(key, [product]);
}

// 구매/환불 시 시뮬레이션 세션에서만 바뀌는 재고 오버레이.
const stockOverlay = new Map<string, number>();
function overlayKey(locationId: string, skuId: number) {
  return `${locationId}::${skuId}`;
}

export function adjustStock(locationId: string, skuId: number, delta: number) {
  const key = overlayKey(locationId, skuId);
  stockOverlay.set(key, (stockOverlay.get(key) ?? 0) + delta);
}

export async function fetchProductsAtLocation(
    location: LocationInfo,
    _zoneLabel: string
): Promise<ProductInfo[]> {
  // locationId 하나가 아니라 실제 grid 좌표를 기준으로 조회한다.
  // Agent에서는 같은 x/y에 level이 다른 PICK 위치가 존재할 수 있기 때문이다.
  const floor = Number(location.zoneId.match(/^F(\d+)-/)?.[1] ?? 0);
  const key = `${floor}:${location.x}:${location.y}`;
  const products = productsByCell.get(key) ?? [];

  return products.map((product) => {
    const overlay = stockOverlay.get(overlayKey(location.locationId, product.skuId)) ?? 0;
    return {
      skuId: product.skuId,
      name: product.name,
      price: product.price,
      stock: Math.max(0, product.stock + overlay),
    };
  });
}