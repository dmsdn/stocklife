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
      { type: 'family_restroom', x: 90, y: 68 },
      { type: 'restroom_male', x: 91, y: 69 },
      { type: 'water', x: 92, y: 69 },
      { type: 'restroom_female', x: 90, y: 70 },
      { type: 'escalator_up', x: 88, y: 66 },
      { type: 'elevator', x: 91, y: 70 },
    ],
    serviceAreas: [
      // F1-D/F1-A 오른쪽 통로 안전 칸에 맞춘 행사대(기존보다 축소).
      { id: 'event-1', label: '행사 상품', x: 34, y: 28, w: 6, h: 8 },
      { id: 'event-2', label: '행사 상품', x: 19, y: 57, w: 20, h: 7 },
      // 정면 통로(y=66~67, 실측 h=2)에 왼쪽부터 겹치지 않게 한 줄 배치.
      { id: 'entrance', label: '입구', x: 7, y: 66, w: 6, h: 2 },
      { id: 'checkout', label: '계산대 / SCAN', x: 15, y: 66, w: 18, h: 2 },
      { id: 'atm', label: 'ATM', x: 35, y: 66, w: 4, h: 2 },
      { id: 'bakery-counter', label: '베이커리', x: 41, y: 66, w: 10, h: 2 },
      { id: 'food-court', label: '푸드코트', x: 53, y: 66, w: 16, h: 2 },
      { id: 'customer-center', label: '고객센터', x: 71, y: 66, w: 14, h: 2 },
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
      { type: 'family_restroom', x: 90, y: 68 },
      { type: 'restroom_male', x: 91, y: 69 },
      { type: 'water', x: 92, y: 69 },
      { type: 'restroom_female', x: 90, y: 70 },
      { type: 'escalator_up', x: 88, y: 66 },
      { type: 'escalator_down', x: 89, y: 67 },
      { type: 'elevator', x: 91, y: 70 },
    ],
    serviceAreas: [
      { id: 'event', label: '행사 상품', x: 78, y: 1, w: 6, h: 22 },
      { id: 'event-2', label: '행사 상품', x: 79, y: 24, w: 9, h: 15 },
      // 2층 하단 실제 통로(y=61~62, h=2)에 왼쪽부터 겹치지 않게 배치.
      { id: 'optical-hearing-center', label: '안경 / 보청기 센터', x: 2, y: 61, w: 17, h: 2 },
      { id: 'pharmacy', label: '약국', x: 21, y: 61, w: 17, h: 2 },
      { id: 'tasting-corner', label: '시식 코너', x: 15, y: 59, w: 66, h: 2 },
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
      { type: 'family_restroom', x: 90, y: 68 },
      { type: 'restroom_male', x: 91, y: 69 },
      { type: 'water', x: 92, y: 69 },
      { type: 'restroom_female', x: 90, y: 70 },
      { type: 'escalator_down', x: 89, y: 67 },
      { type: 'elevator', x: 91, y: 70 },
    ],
    serviceAreas: [
      { id: 'as-center', label: 'A/S센터', x: 9, y: 57, w: 15, h: 4 },
      { id: 'appliance-experience', label: '가전 체험존', x: 26, y: 57, w: 29, h: 4 },
      { id: 'lounge', label: '휴게 라운지', x: 57, y: 57, w: 20, h: 4 },
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

export function fallbackZoneColor(zoneId: string): string {
  let h = 0;
  for (let i = 0; i < zoneId.length; i++) h = (h * 31 + zoneId.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 35%, 78%)`;
}
