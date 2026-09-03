// storeflow-backend(/api/map/floors/{floorNo})와 실제로 연동된 층 데이터.
// 매대(zones/locations)·보행 격자(map_cells)는 DB에서 그대로 받아오고, DB에 없는
// 편의시설·서비스구역(화장실·계산대·시식코너 등)은 floorAmenities.ts의 로컬 레이아웃과
// 합쳐서 기존 FloorData 형태로 만들어준다 — Phaser 씬 등 나머지 프론트 코드는 이 병합
// 결과만 보므로 전혀 수정할 필요가 없다.

import type { FloorData, LocationInfo, ZoneInfo, FacilityInfo } from '../game/types';
import { FLOOR_AMENITIES, ZONE_COLORS, fallbackZoneColor, OCCUPIED_CELL_OVERRIDES } from '../data/floorAmenities';
import { fetchProductsAtLocation } from './products';

const FLOOR_LABELS: Record<number, string> = { 0: 'B1', 1: '1F', 2: '2F', 3: '3F' };

interface MapCellDto {
  x: number;
  y: number;
  passable: boolean;
  transitId: string | null;
  kind?: 'AISLE' | 'SHELF' | 'FACILITY' | 'TRANSIT' | null;   // 09-02: 백엔드 map_cells.kind
  shelfZone?: string | null;                                    // 09-02: kind=SHELF 의 zone_id
  facilityKind?: string | null;                                 // 09-03: kind=FACILITY/TRANSIT 일 때 시설 종류
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
  facilities?: LocationDto[];   // 09-03: tier_role=FACILITY 위치. locationId 3번째 조각이 종류
                                 // (예: 'F1-X-RESTROOM_M-1' -> 'RESTROOM_M')
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

  // 09-03: 시설이 이제 DB의 실제 위치 데이터(locations.tier_role=FACILITY)로 내려온다.
  // 있으면 이걸로 정확한 좌표를 쓰고, floorAmenities.ts의 손좌표는 폴백(옛 백엔드)으로만 남긴다.
  // locationId 3번째 조각이 종류다: 'F1-X-RESTROOM_M-1' -> 'RESTROOM_M'.
  const dbFacilities = dto.facilities ?? [];
  let facilities = amenities.facilities;
  let serviceAreas = amenities.serviceAreas;
  if (dbFacilities.length > 0) {
    // 아이콘+상호작용(엘리베이터 층 이동 등)이 걸려 있는 종류만 FacilityType으로 매핑한다.
    const KIND_TO_TYPE: Record<string, FacilityInfo['type']> = {
      ELEVATOR: 'elevator',
      RESTROOM_M: 'restroom_male',
      RESTROOM_F: 'restroom_female',
    };
    // 나머지는 예전 serviceArea처럼 이름표만 그린다(회색 블록 자체는 map_cells.kind=FACILITY로
    // 이미 정확히 칠해지므로 여기 w/h는 실제로 안 쓰인다 — StoreScene이 facilityCells가 있으면
    // 박스를 안 그리고 라벨만 남기기 때문).
    const LABEL_ONLY_KIND: Record<string, string> = {
      ATM: 'ATM',
      BAKERY: '베이커리',
      CHECKOUT: '계산대 / SCAN',
      CUSTOMER_SERVICE: '고객센터',
      ENTRANCE: '입구',
      EVENT: '행사 상품',
      FOODCOURT: '푸드코트',
      TRASH: '휴지통',
      OPTICAL: '안경 / 보청기 센터',
      PHARMACY: '약국',
      TASTING: '시식 코너',
      AS_CENTER: 'A/S센터',
      EXPERIENCE: '가전 체험존',
      LOUNGE: '휴게 라운지',
    };
    // 09-03 (성원님 확정): 에스컬레이터는 x=94 칸이 상행, x=92 칸이 하행이다.
    // 1층은 상행만, 3층은 하행만, 2층은 둘 다 인터랙션(층 이동)을 연다 — 나머지 한쪽은
    // 블록 자체는 그대로 보이되(실제 통행 가능 칸이라 시각적으로 존재) 이름표만 붙이고
    // 층 이동은 안 걸어준다(눌러도 반응 없음, 기존에도 그 층엔 그 방향이 없었다).
    // 09-03(2차 조정, 성원님 확정): x=92/94 -> x=91/93 로 한 칸씩 안쪽(왼쪽)으로 이동.
    const ESCALATOR_UP_X = 93;
    const ESCALATOR_DOWN_X = 91;
    const allowEscalatorUp = floor !== 3;
    const allowEscalatorDown = floor !== 1;

    const dbMapped: typeof facilities = [];
    const dbAreas: NonNullable<typeof serviceAreas> = [];
    for (const f of dbFacilities) {
      const kind = f.locationId.split('-')[2] ?? '';
      if (kind === 'ESCALATOR') {
        if (f.x === ESCALATOR_UP_X && allowEscalatorUp) {
          dbMapped.push({ type: 'escalator_up', x: f.x, y: f.y });
        } else if (f.x === ESCALATOR_DOWN_X && allowEscalatorDown) {
          dbMapped.push({ type: 'escalator_down', x: f.x, y: f.y });
        }
        // 09-03(성원님 피드백): 그 층에서 안 쓰는 방향(예: 1층의 하행 칸)은 예전엔 "에스컬레이터"
        // 라벨을 따로 붙였는데, 바로 옆 칸(2칸 거리)에 실제 인터랙션 되는 에스컬레이터가 이미
        // "에스컬레이터(상행)" 같은 제대로 된 이름표를 달고 있어서 중복이었고, 좁은 1칸 상자에
        // 억지로 줄바꿈되면서 글자가 잘려 보이는 원인이었다 — 그래서 그냥 라벨을 안 붙인다.
        // 블록 자체(회색 칸)는 facilityCells가 그대로 그려주니 자리는 계속 보인다.
        continue;
      }
      const type = KIND_TO_TYPE[kind];
      if (type) {
        dbMapped.push({ type, x: f.x, y: f.y });
      } else if (LABEL_ONLY_KIND[kind]) {
        dbAreas.push({ id: f.locationId, label: LABEL_ONLY_KIND[kind], x: f.x, y: f.y, w: 1, h: 1 });
      }
    }
    facilities = dbMapped;
    serviceAreas = dbAreas;
  }

  // 09-02 (로컬 검증안): 칸의 정체를 백엔드가 주면 그대로 넘긴다 — StoreScene 이
  // 최근접 존 추측 대신 이것으로 칠한다. 옛 백엔드(kind 없음)면 둘 다 비어 폴백.
  const shelfCells = dto.cells
    .filter((c) => c.kind === 'SHELF' && c.shelfZone && !overrides?.has(`${c.x},${c.y}`))
    .map((c) => ({ x: c.x, y: c.y, zoneId: c.shelfZone as string }));
  // 09-03(2차 조정): 입구(ENTRANCE) 칸은 회색 시설 블록으로 칠하지 않는다 — 실제 매장
  // 입구는 막힌 공간이 아니라 열린 통로라서, 다른 시설(엘리베이터/화장실 등)과 달리
  // 회색 박스를 그리면 오히려 부자연스럽다는 성원님 피드백.
  const facilityCells: [number, number][] = dto.cells
    .filter((c) => c.kind === 'FACILITY' && c.facilityKind !== 'ENTRANCE')
    .map((c) => [c.x, c.y]);

  return {
    shelfCells,
    facilityCells,
    floor,
    floorLabel: FLOOR_LABELS[floor] ?? `${floor}F`,
    gridWidth: maxX + 1,
    gridHeight: maxY + 1,
    pitchPx: amenities.pitchPx,
    zones,
    locations,
    occupied,
    facilities,
    serviceAreas,
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