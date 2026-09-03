// DB(storeflow_db)에는 매대(zones/locations/map_cells)만 있고, 화장실·정수기·엘리베이터
// 같은 "매장 편의시설"과 계산대·ATM·시식코너 같은 "서비스 구역"은 스키마에 아예 없다
// (db/schema_v2.sql 참고 — facilities/service_areas 테이블 자체가 없음). 이 값들은 매장
// 도면에서 손으로 뽑아낸 고정 레이아웃이라 DB 연동 여부와 무관하게 프론트에 남겨둔다.
//
// 2026-08-27 재배치: 실제 DB 그리드가 커지면서(1~3층 95x75칸, 예전 대비 약 1.7x/1.56x)
// 아래 좌표를 전부 다시 계산했다. 기준은 성원님이 받은 실제 zone별 좌표 범위
// (docker exec ... SELECT zone_id, MIN(x), MAX(x), MIN(y), MAX(y) FROM locations ...)
// 이고, 옛 좌표(대략 56x48 그리드 기준)에 가로 x1.696, 세로 x1.5625를 곱한 값을
// 기본으로 삼되, 실제 zone 박스와 겹치면 그 옆 통로/여백으로 옮겼다. 층마다 화장실·
// 에스컬레이터·엘리베이터를 오른쪽 여백(각 층의 zone 최대 x보다 바깥)에 세로로
// 쌓아서, 실제 건물처럼 층마다 같은 자리에 있는 것처럼 보이게 했다.
//
// pitchPx도 여기 둔다 — 렌더링 배율일 뿐 DB 데이터가 아니다.
// 2026-08-31 재배치(4차, 라이브 DB seed 재검증): AWS RDS에 실제로 적재된
// Agent/sim/out/world_seed.sql을 다시 직접 파싱해서 검증한 결과, 화장실/정수기/
// 엘리베이터가 지금까지 x=90~92,y=68~70의 좁은 3x3 칸에 5개가 겹쳐 있었다는 걸
// 확인했다 — 이 자리는 원래 db/seed/world_seed.sql(구 시드) 기준으로 잡은 것인데,
// 라이브 DB는 Agent/sim/out/world_seed.sql(신 시드)로 적재되어 있어서(성원님이 준
// 참고 도면 이미지와도 안 맞았다) 좌표가 어긋나 있었다. 신 시드의 map_cells를 다시
// BFS로 훑어서 각 층 가장 오른쪽 존(1F: F1-H, 2F: F2-A, 3F: F3-A)의 오른쪽 통로인
// x=86~88이 세 층 모두 y=26~45 구간에서 통행 가능하다는 걸 확인했고, 참고 도면처럼
// 이 통로에 세로로 5칸(엘리베이터→화장실 3종→정수기) 나눠 배치했다. 에스컬레이터는
// map_cells.transit_id='ESC' 칸(x=88~89,y=66~67, 세 층 모두 동일)을 그대로 쓴다 —
// 이건 신/구 시드 모두에서 일치해서 원래도 맞았다.
import type { FacilityInfo, ServiceArea } from '../game/types';

export interface FloorAmenities {
  pitchPx: number;
  facilities: FacilityInfo[];
  serviceAreas: ServiceArea[];
}

export const FLOOR_AMENITIES: Record<number, FloorAmenities> = {
  0: {
    pitchPx: 20,
    // B1-W(창고) 실제 범위: x 3~60, y 3~36 — 엘리베이터는 그 오른쪽 여백에 배치.
    facilities: [{ type: 'elevator', x: 65, y: 19 }],
    serviceAreas: [],
  },
  1: {
    // zone 실제 범위(1F): F1-F(2~34,0~18) F1-G(39~56,2~20) F1-H(60~84,0~23)
    //                     F1-D(2~32,20~38) F1-E(40~58,24~47)
    //                     F1-A(2~32,39~58) F1-B(39~62,48~63) F1-C(64~87,46~64)
    // 그리드 전체 95x75 — 화장실/에스컬레이터/엘리베이터는 F1-H·F1-C(가장 오른쪽,
    // 최대 x=87)보다 바깥인 x=88 여백에 세로로 쌓는다.
    pitchPx: 20,
    // 2026-08-27 재배치(3차, DB seed 원본 검증): 성원님이 O키 디버그 오버레이 스크린샷으로
    // "빨간 네모(통행 불가) 안쪽이 매대 자리이고, 지금 시설/서비스구역이 전부 그 빨간 네모
    // 테두리 위에 얹혀 있다"는 걸 확인해주셔서, 더 이상 zone 박스 추정으로 좌표를 잡지 않고
    // db/seed/world_seed.sql의 map_cells(passable)·locations 원본을 직접 파싱해서 검증했다.
    // 방법: 층별 map_cells에서 BFS로 "가장 큰 연결된 통행가능 영역"을 구하고, 거기서 실제
    // 매대(locations) 칸을 뺀 "안전 칸(통행 가능 + 매대 아님)" 집합을 만든 뒤, 모든 시설/구역
    // 좌표가 이 안전 칸에 완전히 들어가는지 하나씩 검사·재배치했다. 에스컬레이터(x=88~89,
    // y=66~67)는 map_cells.transit_id='ESC'로 직접 확인된 값이라 그대로 유지.
    // 실제 확인된 1층 정면 통로는 y=66~67 두 줄(x=7~90 연속 통행 가능)뿐이라, 계산대·ATM·
    // 베이커리·푸드코트·고객센터·입구를 전부 이 두 줄 폭(h=2) 안에서 겹치지 않게 한 줄로
    // 재배치했다(예전 h=3~4짜리 박스는 실제로 존재하지 않는 폭이라 전부 안전 칸 밖으로
    // 삐져나가 있었다).
    facilities: [
      { type: 'elevator', x: 87, y: 27 },
      { type: 'family_restroom', x: 87, y: 31 },
      { type: 'restroom_male', x: 87, y: 35 },
      { type: 'water', x: 87, y: 39 },
      { type: 'restroom_female', x: 87, y: 43 },
      { type: 'escalator_up', x: 88, y: 66 },
    ],
    serviceAreas: [
      // F1-D/F1-A 오른쪽 통로 안전 칸에 맞춘 행사대(기존보다 축소).
      { id: 'event-1', label: '행사 상품', x: 26, y: 27, w: 8, h: 10 },
      { id: 'event-2', label: '행사 상품', x: 65, y: 29, w: 18, h: 14 },
      // 정면 통로(y=66~67, 실측 h=2)에 왼쪽부터 겹치지 않게 한 줄 배치.
      { id: 'entrance', label: '입구', x: 7, y: 73, w: 6, h: 2 },
      { id: 'checkout', label: '계산대 / SCAN', x: 15, y: 66, w: 15, h: 3 },
      { id: 'atm', label: 'ATM', x: 36, y: 67, w: 4, h: 2 },
      { id: 'bakery-counter', label: '베이커리', x: 41, y: 66, w: 10, h: 3 },
      { id: 'food-court', label: '푸드코트', x: 53, y: 66, w: 16, h: 3 },
      { id: 'customer-center', label: '고객센터', x: 30, y: 69, w: 6, h: 4 },
    ],
  },
  2: {
    // zone 실제 범위(2F): F2-F(2~34,1~20,청소) F2-E(43~75,1~19,주방용품)
    //                     F2-D(2~40,23~36,위생) F2-C(49~67,23~42,수납/생활잡화)
    //                     F2-B(2~40,39~58,뷰티/헬스) F2-A(49~86,41~59,반려용품)
    // 화장실/에스컬레이터/엘리베이터는 1층과 같은 x=88 라인에 맞춰서 층마다 같은
    // 위치처럼 보이게 하고(F2-A 최대 x=86보다 바깥이라 안전), 위아래로만 늘어놓는다.
    pitchPx: 20,
    // 2026-08-27 재배치(3차, DB seed 원본 검증) — 방법은 1F 주석 참고. 2층 실제 통로는
    // y=61~62(2층 하단 통로, 1층과 달리 y=66은 이 층에서 좁고 끊겨 있어 쓸 수 없었음)라
    // 시식코너/안경보청기센터/약국을 이 폭(h=2)에 맞춰 재배치했다. 오른쪽 행사대 2개는
    // 실제 안전 칸 세로 통로(x=78~88 부근)에 맞춰 폭을 줄였다.
    facilities: [
      { type: 'elevator', x: 87, y: 27 },
      { type: 'family_restroom', x: 87, y: 31 },
      { type: 'restroom_male', x: 87, y: 35 },
      { type: 'water', x: 87, y: 39 },
      { type: 'restroom_female', x: 87, y: 43 },
      { type: 'escalator_up', x: 88, y: 66 },
      { type: 'escalator_down', x: 89, y: 67 },
    ],
    serviceAreas: [
      { id: 'event', label: '행사 상품', x: 84, y: 1, w: 9, h: 23 },
      { id: 'event-2', label: '행사 상품', x: 72, y: 24, w: 7, h: 18 },
      // 2층 하단 실제 통로(y=61~62, h=2)에 왼쪽부터 겹치지 않게 배치.
      { id: 'optical-hearing-center', label: '안경 / 보청기 센터', x: 2, y: 61, w: 6, h: 4 },
      { id: 'pharmacy', label: '약국', x: 2, y: 65, w: 6, h: 4 },
      { id: 'tasting-corner', label: '시식 코너', x: 15, y: 61, w: 66, h: 4 },
    ],
  },
  3: {
    // zone 실제 범위(3F): F3-D(2~20,2~39,의류) F3-E(28~56,2~15,잡화/가방)
    //                     F3-C(28~62,18~39,완구/문구) F3-A(62~89,4~55,스포츠/레저)
    //                     F3-B(2~56,42~55,홈/가전)
    // F3-A 최대 x=89라 화장실 라인은 x=91로 한 칸 더 밀었다.
    pitchPx: 20,
    // 2026-08-27 재배치(3차, DB seed 원본 검증) — 방법은 1F 주석 참고. 3층은 y=57 줄이
    // 실제로 h=4까지 안전 칸이라 기존 폭 그대로 한 줄에 배치할 수 있었다.
    facilities: [
      { type: 'elevator', x: 87, y: 27 },
      { type: 'family_restroom', x: 87, y: 31 },
      { type: 'restroom_male', x: 87, y: 35 },
      { type: 'water', x: 87, y: 39 },
      { type: 'restroom_female', x: 87, y: 43 },
      { type: 'escalator_down', x: 89, y: 67 },
    ],
    serviceAreas: [
      { id: 'as-center', label: 'A/S센터', x: 1, y: 57, w: 6, h: 8 },
      { id: 'appliance-experience', label: '가전 체험존', x: 1, y: 65, w: 29, h: 8 },
      { id: 'lounge', label: '휴게 라운지', x: 30, y: 65, w: 40, h: 8 },
    ],
  },

};

// zoneId -> 도면 원본 색상. DB(zones 테이블)에는 색상 컬럼이 없어서 프론트가 들고 있는다.
// 못 찾는 zoneId가 나오면(신규 존 추가 등) 해시 기반으로 파스텔톤을 하나 만들어 대체한다.
export const ZONE_COLORS: Record<string, string> = {
  'B1-W': '#8a8a8a',
  'F1-A': '#d6bfb8',
  'F1-B': '#e9bfa0',
  'F1-C': '#bce0c0',
  'F1-D': '#f5b4b8',
  'F1-E': '#edecbc',
  'F1-F': '#c7e2ed',
  'F1-G': '#d4cfe9',
  'F1-H': '#b7cedf',
  'F2-A': '#bce0c0',
  'F2-B': '#f5b4b8',
  'F2-C': '#f2ceb5',
  'F2-D': '#edecbc',
  'F2-E': '#d4cfe9',
  'F2-F': '#c7e2ed',
  'F3-A': '#bce0c0',
  'F3-B': '#c7e2ed',
  'F3-C': '#edecbc',
  'F3-D': '#f5b4b8',
  'F3-E': '#d4cfe9',
};

// 2026-08-31: DB 시드 데이터 이상으로 실제로는 지나갈 수 있어야 할 칸이 통행 불가(passable=false)로
// 잘못 들어와 있는 경우를 화면에서만 가려주는 프론트 전용 예외 목록.
// DB, SQL은 이정기 팀원 허락 없이 건드리면 안 되므로, DB 값은 그대로 두고 여기서만
// 렌더링/경로탐색/O키 디버그 오버레이에서 제외시킨다.
// floor(1=1F 등) -> "x,y" 형태의 좌표 문자열 집합.
export const OCCUPIED_CELL_OVERRIDES: Record<number, Set<string>> = {
  1: new Set(['10,70', '10,71', '10,72']),
};

// 09-03: 존 이름표(예: "A 청과") 위치는 원래 StoreScene.ts가 zone의 매대 좌표 범위를 보고
// 자동으로 계산한다(맨 왼쪽 위 칸 근처, 매대에 안 겹치는 빈 행을 찾아서). 근데 매장 구조가
// 복잡한 곳에서는 자동계산이 이상한 자리에 라벨을 놓는 경우가 있어서, zoneId별로 직접
// 좌표(그리드 x,y — 라벨의 왼쪽 위 기준점)를 지정할 수 있게 해뒀다. 여기 값이 있으면
// 자동계산 대신 이 좌표를 그대로 쓴다(StoreScene.ts의 zone 라벨 렌더링 부분 참고).
// floor(1=1F 등) -> zoneId -> {x, y}.
export const ZONE_LABEL_OVERRIDES: Record<number, Record<string, { x: number; y: number }>> = {
  1: {'F1-A': { x: 4, y: 39 },'F1-B': { x: 40, y: 48 },'F1-C': { x: 65, y: 45 }, 'F1-D': { x: 4, y: 20 }, 'F1-E': { x: 40, y: 24 }, 'F1-F': { x: 4, y: 1 }, 'F1-G': { x: 40, y: 1 }, 'F1-H': { x: 61, y: 1 }},
  2: {'F2-A': { x: 49, y: 46 },'F2-B': { x: 2, y: 39 },'F2-C': { x: 49, y: 23 }, 'F2-D': { x: 2, y: 23 }, 'F2-E': { x: 43, y: 1 }, 'F2-F': { x: 2, y: 2 }, 'F2-G': { x: 40, y: 1 }, 'F2-H': { x: 61, y: 1 }},
  3: {'F3-A': { x: 71, y: 3 },'F3-B': { x: 2, y: 42 },'F3-C': { x: 28, y: 18 }, 'F3-D': { x: 3, y: 2 }, 'F3-E': { x: 28, y: 2 }},
};

// 09-03: 계산대/ATM/베이커리 같은 "표시용 구역"(ServiceArea) 이름표도 zone 이름표와 같은
// 문제(위치 제각각, 겹침)가 있어서 똑같은 방식으로 직접 좌표를 지정할 수 있게 해뒀다.
// 키는 area.id — DB에서 온 경우 시설의 locationId 그대로다(예: 'F1-X-CHECKOUT-1',
// 'F1-X-ATM-1' 등 — api/locations.ts의 dbAreas.push()가 f.locationId를 id로 넣는다).
// 값은 라벨이 "가운데" 놓일 그리드 칸(x,y) — P키로 확인한 좌표를 그대로 넣으면 된다.
// floor(1=1F 등) -> locationId -> {x, y}.
export const SERVICE_AREA_LABEL_OVERRIDES: Record<number, Record<string, { x: number; y: number }>> = {
  1: {'F1-X-CHECKOUT-1': { x: 25, y: 69 },'F1-X-ATM-1': { x: 36, y: 69 },'F1-X-BAKERY-1': { x: 62, y: 72 }, 'F1-X-FOODCOURT-1': { x: 75, y: 72 }, 'F1-X-CUSTOMER_SERVICE-1': { x: 46, y: 72 }, 'F1-X-TRASH-1': { x: 93, y: 38 }, 'F1-X-EVENT-1': { x: 29, y: 32 }, 'F1-X-EVENT-2': { x: 74, y: 36 }},
  2: {'F2-X-OPTICAL-1': { x: 5, y: 66 },'F2-X-PHARMACY-1': { x: 5, y: 72 },'F2-X-TASTING-1': { x: 46, y: 68 },'F2-X-TRASH-1': { x: 93, y: 38 }},
  3: {'F3-X-TRASH-1': { x: 93, y: 38 }},
};

export function fallbackZoneColor(zoneId: string): string {
  let h = 0;
  for (let i = 0; i < zoneId.length; i++) h = (h * 31 + zoneId.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 35%, 78%)`;
}
