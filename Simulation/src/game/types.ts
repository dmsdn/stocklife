// 백엔드 storeflow_db 스키마(zones/locations)와 1:1로 대응하는 타입.
// 실제 서버 연동 시 이 타입들은 그대로 API 응답 타입으로 재사용 가능하도록 필드명을 맞춰뒀다.

export interface ZoneInfo {
  zoneId: string;   // 'F1-A' — schema_v2.sql의 zones.zone_id
  letter: string;   // 'A'
  label: string;    // '쌀·면·통조림 구역' — zones.name
  color: string;    // 도면 원본 색상(참고용 hex)
}

export interface LocationInfo {
  locationId: string; // 'F1-A-R01-B01-L2' — schema_v2.sql의 locations.location_id
  zoneId: string;
  rack: number;       // rack_no
  bay: number;         // bay_no
  x: number;            // 그리드 좌표 (원점=좌상단, 셀=PITCH px)
  y: number;
}

export type FacilityType =
  | 'escalator_up'
  | 'escalator_down'
  | 'elevator'
  | 'restroom_male'
  | 'restroom_female'
  | 'family_restroom'
  | 'water';

export interface FacilityInfo {
  type: FacilityType;
  x: number;
  y: number;
}

// 매대에 진열된 상품 — 실제 DB 연동 전까지는 location_id 기반으로 결정적으로
// 생성한 더미 데이터(src/api/products.ts)를 사용한다.
export interface ProductInfo {
  skuId: number;
  name: string;
  price: number;
  stock: number;
}

export interface CartItem extends ProductInfo {
  locationId: string;
  qty: number;
}

export interface FloorData {
  floor: number;         // 0(B1)~3
  floorLabel: string;    // '1F'
  gridWidth: number;
  gridHeight: number;
  pitchPx: number;
  zones: ZoneInfo[];
  locations: LocationInfo[];
  occupied: [number, number][]; // 매대가 차지하는 그리드 셀 (통행 불가 = map_cells.passable=0에 대응)
  facilities: FacilityInfo[];
}

export interface GridPoint {
  x: number;
  y: number;
}

// 백엔드 shelf_events 8종과 이름을 맞춰뒀다 — 나중에 실제 이벤트 발행 시 그대로 대응된다.
export type ShelfEventType =
  | 'SALE'
  | 'BELOW_PAR'
  | 'TASK_QUEUED'
  | 'TASK_STARTED'
  | 'ITEM_CONFIRMED'
  | 'STOCKOUT'
  | 'RESTOCK_IN'
  | 'MOVE';

export interface RestockTask {
  taskId: string;
  locationId: string;
  skuId: number;
  status: 'QUEUED' | 'STARTED' | 'CONFIRMED';
}
