// 지금은 로컬 JSON(src/data/floor{N}.json)을 읽지만, 백엔드가 준비되면
// 이 파일의 구현부만 fetch(`/api/locations?floor=${n}`)로 바꾸면 된다.
// 프론트 나머지 코드(Phaser 씬, 컴포넌트)는 FloorData 타입만 알면 되므로
// 이 스왑에 영향받지 않는다 — "좌표는 항상 API로 조회" 원칙을 지키기 위한 경계.

import type { FloorData } from '../game/types';
import floor0 from '../data/floor0.json';
import floor1 from '../data/floor1.json';
import floor2 from '../data/floor2.json';
import floor3 from '../data/floor3.json';
import { fetchProductsAtLocation } from './products';

const FLOORS: Record<number, FloorData> = {
  0: floor0 as FloorData,
  1: floor1 as FloorData,
  2: floor2 as FloorData,
  3: floor3 as FloorData,
};

export async function fetchFloorData(floor: number): Promise<FloorData> {
  // TODO(백엔드 연동): 아래 한 줄을 실제 API 호출로 교체
  //   const res = await fetch(`/api/locations?floor=${floor}`);
  //   return res.json();
  const data = FLOORS[floor];
  if (!data) throw new Error(`floor ${floor} not found`);
  return Promise.resolve(data);
}

// NPC 재고보충 대상을 서버에서 받아오는 자리 (지금은 목업).
// 실제 연동 시 GET /api/inventory/low-stock 이 (locationId, skuId, currentQty) 목록을 반환하도록
// 스키마_변경규칙.md의 shelf_configs.min_qty 를 기준으로 백엔드가 계산해줘야 한다.
export interface LowStockItem {
  locationId: string;
  skuId: number;
  currentQty: number;
}

// 재고보충 NPC(StoreScene)는 직접 이 로직을 스캔+선점 큐로 감싸서 쓰지만(동시에 여러 NPC가
// 같은 매대로 몰리지 않도록), 이 함수 자체는 "지금 이 층에서 재고가 모자란 곳"을 그대로
// 알려주는 조회용 API로도 쓸 수 있게 실제로 동작하게 구현해둔다 — 백엔드 연동 시에는
// 아래 로컬 스캔을 fetch(`/api/inventory/low-stock?floor=${floor}`) 한 줄로 바꾸면 된다.
const LOW_STOCK_THRESHOLD = 5;

export async function fetchLowStockTargets(floor: number): Promise<LowStockItem[]> {
  const data = FLOORS[floor];
  if (!data) return [];
  const zoneById = new Map(data.zones.map((z) => [z.zoneId, z]));
  const targets: LowStockItem[] = [];
  for (const loc of data.locations) {
    const zone = zoneById.get(loc.zoneId);
    const products = await fetchProductsAtLocation(loc, zone?.label ?? loc.zoneId);
    for (const p of products) {
      if (p.stock < LOW_STOCK_THRESHOLD) {
        targets.push({ locationId: loc.locationId, skuId: p.skuId, currentQty: p.stock });
      }
    }
  }
  return targets;
}

// NPC가 매대에 도착해서 실제로 보충을 완료했을 때 호출 — 실제 DB 수량이 올라가는 지점.
export async function confirmRestock(locationId: string, skuId: number, qty: number): Promise<void> {
  // TODO(백엔드 연동): POST /api/inventory/{skuId}/restock { locationId, qty }
  // 백엔드는 이 호출을 shelf_events에 TASK_STARTED → ITEM_CONFIRMED 로 기록해야 한다
  // (스키마_변경규칙.md 동작계약 #2: BELOW_PAR는 재고를 바꾸는 것과 같은 트랜잭션에서 발행).
  console.log('[stub] confirmRestock', { locationId, skuId, qty });
  return Promise.resolve();
}
