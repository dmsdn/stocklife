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

// 팀이 준 매장 도면(1F/2F/3F 이미지)에 있는 "매대는 아니지만 매장을 구성하는 요소들" —
// 행사 상품 진열대, 계산대/SCAN, ATM, 베이커리·푸드코트 같은 취식 코너, 고객센터,
// 안경/보청기 센터·약국, 시식 코너, A/S센터, 가전 체험존, 휴게 라운지, 입구 표시 등.
// 매대(LocationInfo)처럼 상품이 진열되거나 클릭해서 상품 팝업이 뜨는 대상이 아니라,
// 그냥 "여기에 이런 공간이 있다"를 보여주는 순수 표시용 사각 구역이다 — 그래서 일부러
// occupied(통행 가능 여부)나 locations(상품 위치)에는 전혀 관여하지 않는다: NPC 길찾기나
// Agent 쪽 매대 좌표 데이터에 영향을 주지 않고 화면에 라벨 박스만 하나 더 그리는 것뿐이다.
export interface ServiceArea {
  id: string;     // 'checkout' | 'atm' | 'bakery' | ... (고유 식별자, 존/시설 타입과 안 겹치게)
  label: string;  // 화면에 표시할 이름, 예: '계산대 / SCAN'
  x: number;      // 그리드 좌표 (왼쪽 위 모서리, 셀 단위)
  y: number;
  w: number;      // 폭(칸 수)
  h: number;      // 높이(칸 수)
}

// 매대에 진열된 상품 — 실제 DB 연동 전까지는 location_id 기반으로 결정적으로
// 생성한 더미 데이터(src/api/products.ts)를 사용한다.
export interface ProductInfo {
  skuId: number;
  name: string;
  price: number;
  stock: number;
  barcode?: string;
}

// Agent/sim/out/world_seed.sql의 stocks(PICK) + locations를 그대로 합친 상품 좌표.
// x/y는 Agent 좌표를 오프셋/스케일 없이 그대로 사용한다.
export interface ProductPosition extends ProductInfo {
  locationId: string;
  zoneId: string;
  floor: number;
  x: number;
  y: number;
  barcode?: string;
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
  productPositions?: ProductPosition[]; // Agent PICK 상품 1개당 1행(정확한 x/y)
  occupied: [number, number][]; // 매대가 차지하는 그리드 셀 (통행 불가 = map_cells.passable=0에 대응)
  // 09-02 (로컬 검증안): 백엔드 map_cells.kind/shelf_zone 을 그대로 실은 것.
  // 있으면 StoreScene 이 "최근접 location 존" 추측 대신 이 값으로 칠한다.
  shelfCells?: { x: number; y: number; zoneId: string }[];   // kind=SHELF
  facilityCells?: [number, number][];                         // kind=FACILITY
  facilities: FacilityInfo[];
  serviceAreas?: ServiceArea[]; // 행사 상품·계산대·ATM 등 매대가 아닌 표시용 구역(선택적)
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