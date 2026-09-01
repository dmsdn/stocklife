// storeflow-backend(/api/map/floors/{floorNo})와 실제로 연동된 층 데이터.
// 매대(zones/locations)·보행 격자(map_cells)는 DB에서 그대로 받아오고, DB에 없는
// 편의시설·서비스구역(화장실·계산대·시식코너 등)은 floorAmenities.ts의 로컬 레이아웃과
// 합쳐서 기존 FloorData 형태로 만들어준다 — Phaser 씬 등 나머지 프론트 코드는 이 병합
// 결과만 보므로 전혀 수정할 필요가 없다.

import type { FloorData, LocationInfo, ZoneInfo } from '../game/types';
import { FLOOR_AMENITIES, ZONE_COLORS, fallbackZoneColor, OCCUPIED_CELL_OVERRIDES } from '../data/floorAmenities';
import { fetchProductsAtLocation } from './products';

const FLOOR_LABELS: Record<number, string> = { 0: 'B1', 1: '1F', 2: '2F', 3: '3F' };

interface MapCellDto {
  x: number;
  y: number;
  passable: boolean;
  transitId: string | null;
}

interface ZoneMapDto {
  zoneId: string;
  name: string;
  zoneType: 'SALES' | 'BACKROOM';
}

interface LocationDto {
  locationId: string;
  zoneId: string;
  rackNo: number;
  bayNo: number;
  x: number;
  y: number;
}

interface FloorMapDto {
  floorNo: number;
  zones: ZoneMapDto[];
  cells: MapCellDto[];
  locations: LocationDto[];
}

function zoneLetter(zoneId: string): string {
  // 'F1-A' -> 'A', 'B1-W' -> 'W'
  const parts = zoneId.split('-');
  return parts[parts.length - 1] ?? zoneId;
}

export async function fetchFloorData(floor: number): Promise<FloorData> {
  const res = await fetch(`/api/map/floors/${floor}`);
  if (!res.ok) {
    throw new Error(`GET /api/map/floors/${floor} 실패 (${res.status})`);
  }
  const dto: FloorMapDto = await res.json();

  let maxX = 0;
  let maxY = 0;
  for (const c of dto.cells) {
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }

  const zones: ZoneInfo[] = dto.zones.map((z) => ({
    zoneId: z.zoneId,
    letter: zoneLetter(z.zoneId),
    label: z.name,
    color: ZONE_COLORS[z.zoneId] ?? fallbackZoneColor(z.zoneId),
  }));

  const locations: LocationInfo[] = dto.locations.map((l) => ({
    locationId: l.locationId,
    zoneId: l.zoneId,
    rack: l.rackNo,
    bay: l.bayNo,
    x: l.x,
    y: l.y,
  }));

  // OCCUPIED_CELL_OVERRIDES에 있는 칸은 DB상으로는 여전히 통행 불가(passable=false)지만,
  // 화면/길찾기에서는 없는 셈 치고 걸러낸다 — DB/seed는 그대로 두고 프론트에서만 고친다.
  const overrides = OCCUPIED_CELL_OVERRIDES[floor];
  const occupied: [number, number][] = dto.cells
    .filter((c) => !c.passable && !overrides?.has(`${c.x},${c.y}`))
    .map((c) => [c.x, c.y]);

  const amenities = FLOOR_AMENITIES[floor] ?? { pitchPx: 20, facilities: [], serviceAreas: [] };

  return {
    floor,
    floorLabel: FLOOR_LABELS[floor] ?? `${floor}F`,
    gridWidth: maxX + 1,
    gridHeight: maxY + 1,
    pitchPx: amenities.pitchPx,
    zones,
    locations,
    occupied,
    facilities: amenities.facilities,
    serviceAreas: amenities.serviceAreas,
  };
}

// NPC 재고보충 대상을 서버에서 받아오는 자리. 백엔드에 "이 층에서 재고 모자란 매대 전부"를
// 한 번에 주는 공개 API가 아직 없어서(내부용 /internal/replenishment/pending은 서버간
// 전용 — 프론트가 직접 호출하면 안 됨), 이 층의 매대를 순회하며 /api/locations/{id}/products로
// 하나씩 확인한다. 매대 수가 많은 층은 느릴 수 있음 — 백엔드에 전용 API가 생기면 이 함수만
// 그걸로 교체하면 된다.
export interface LowStockItem {
  locationId: string;
  skuId: number;
  currentQty: number;
}

const LOW_STOCK_THRESHOLD = 5;

export async function fetchLowStockTargets(floor: number): Promise<LowStockItem[]> {
  const data = await fetchFloorData(floor);
  const targets: LowStockItem[] = [];
  for (const loc of data.locations) {
    const products = await fetchProductsAtLocation(loc, loc.zoneId);
    for (const p of products) {
      if (p.stock < LOW_STOCK_THRESHOLD) {
        targets.push({ locationId: loc.locationId, skuId: p.skuId, currentQty: p.stock });
      }
    }
  }
  return targets;
}

// NPC가 매대에 도착해서 실제로 보충을 완료했을 때 호출되는 자리.
// 실제 재고 반영은 백엔드 내부 엔드포인트(/internal/events/shelf)를 통해서만 이뤄지는데,
// 이 경로는 X-Internal-Service-Key(공유 비밀키)가 필요해서 브라우저에 노출하면 안 된다
// (InternalEventController 주석: "프론트는 절대 이 경로를 직접 호출하면 안 된다").
// 그래서 지금은 화면 연출용 스텁으로 남겨둔다 — 실제로 재고를 늘리려면 Agent/백엔드
// 서버간 통신으로 처리하는 별도 공개 API가 먼저 필요하다.
export async function confirmRestock(locationId: string, skuId: number, qty: number): Promise<void> {
  console.log('[stub] confirmRestock (내부 전용 API라 브라우저에서 직접 호출 불가)', {
    locationId,
    skuId,
    qty,
  });
  return Promise.resolve();
}