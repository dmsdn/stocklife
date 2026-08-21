// 지금은 로컬 JSON(src/data/floor{N}.json)을 읽지만, 백엔드가 준비되면
// 이 파일의 구현부만 fetch(`/api/locations?floor=${n}`)로 바꾸면 된다.
// 프론트 나머지 코드(Phaser 씬, 컴포넌트)는 FloorData 타입만 알면 되므로
// 이 스왑에 영향받지 않는다 — "좌표는 항상 API로 조회" 원칙을 지키기 위한 경계.

import type { FloorData } from '../game/types';
import floor0 from '../data/floor0.json';
import floor1 from '../data/floor1.json';
import floor2 from '../data/floor2.json';
import floor3 from '../data/floor3.json';

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

export async function fetchLowStockTargets(_floor: number): Promise<LowStockItem[]> {
  // TODO(백엔드 연동): fetch(`/api/inventory/low-stock?floor=${floor}`)
  return Promise.resolve([]);
}

// NPC가 매대에 도착해서 실제로 보충을 완료했을 때 호출 — 실제 DB 수량이 올라가는 지점.
export async function confirmRestock(locationId: string, skuId: number, qty: number): Promise<void> {
  // TODO(백엔드 연동): POST /api/inventory/{skuId}/restock { locationId, qty }
  // 백엔드는 이 호출을 shelf_events에 TASK_STARTED → ITEM_CONFIRMED 로 기록해야 한다
  // (스키마_변경규칙.md 동작계약 #2: BELOW_PAR는 재고를 바꾸는 것과 같은 트랜잭션에서 발행).
  console.log('[stub] confirmRestock', { locationId, skuId, qty });
  return Promise.resolve();
}
