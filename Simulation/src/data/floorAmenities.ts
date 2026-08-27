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
    facilities: [
      { type: 'family_restroom', x: 92, y: 26 },
      { type: 'restroom_male', x: 92, y: 30 },
      { type: 'water', x: 92, y: 34 },
      { type: 'restroom_female', x: 92, y: 38 },
      { type: 'escalator_up', x: 92, y: 55 },
      { type: 'elevator', x: 92, y: 60 },
    ],
    serviceAreas: [
      // F1-D(2~32,20~38)와 F1-A(2~32,39~58) 오른쪽 통로(x 32~39 사이)의 작은 행사대.
      { id: 'event-1', label: '행사 상품', x: 33, y: 28, w: 6, h: 8 },
      // F1-G/F1-E 오른쪽, F1-H/F1-C 왼쪽 사이 통로에 놓이는 큰 행사 진열대("위시 상품").
      { id: 'event-2', label: '행사 상품', x: 65, y: 29, w: 20, h: 12 },
      // 아래쪽은 모든 매대(F1-A~H) 최대 y(64)보다 바깥인 y=66~ 여백에 한 줄로 배치.
      { id: 'checkout', label: '계산대 / SCAN', x: 2, y: 66, w: 27, h: 3 },
      { id: 'atm', label: 'ATM', x: 31, y: 66, w: 5, h: 3 },
      { id: 'bakery-counter', label: '베이커리', x: 37, y: 66, w: 12, h: 3 },
      { id: 'food-court', label: '푸드코트', x: 51, y: 66, w: 24, h: 3 },
      { id: 'customer-center', label: '고객센터', x: 31, y: 70, w: 19, h: 4 },
      { id: 'entrance', label: '입구', x: 2, y: 70, w: 7, h: 3 },
    ],
  },
  2: {
    // zone 실제 범위(2F): F2-F(2~34,1~20,청소) F2-E(43~75,1~19,주방용품)
    //                     F2-D(2~40,23~36,위생) F2-C(49~67,23~42,수납/생활잡화)
    //                     F2-B(2~40,39~58,뷰티/헬스) F2-A(49~86,41~59,반려용품)
    // 화장실/에스컬레이터/엘리베이터는 1층과 같은 x=88 라인에 맞춰서 층마다 같은
    // 위치처럼 보이게 하고(F2-A 최대 x=86보다 바깥이라 안전), 위아래로만 늘어놓는다.
    pitchPx: 20,
    facilities: [
      { type: 'family_restroom', x: 92, y: 26 },
      { type: 'restroom_male', x: 92, y: 30 },
      { type: 'water', x: 92, y: 34 },
      { type: 'restroom_female', x: 92, y: 38 },
      { type: 'escalator_up', x: 92, y: 55 },
      { type: 'escalator_down', x: 92, y: 60 },
      { type: 'elevator', x: 92, y: 65 },
    ],
    serviceAreas: [
      // F2-E(43~75,1~19) 오른쪽 통로(x 76~88 사이)에 세로로 긴 행사 진열대.
      { id: 'event', label: '행사 상품', x: 87, y: 1, w: 6, h: 22 },
      // F2-C(49~67,23~42) 오른쪽 / F2-E 아래(y 19~41 사이) 빈 통로에 놓이는 두 번째
      // 행사 진열대(첫 번째보다 작은 사이즈로 도면과 구분).
      { id: 'event-2', label: '행사 상품', x: 71, y: 24, w: 9, h: 15 },
      // F2-B(2~40,39~58) 아래(y>58) 여백에 안경/보청기 센터 + 약국.
      { id: 'optical-hearing-center', label: '안경 / 보청기 센터', x: 2, y: 60, w: 17, h: 5 },
      { id: 'pharmacy', label: '약국', x: 2, y: 66, w: 17, h: 5 },
      // F2-C/F2-A 아래(y>59) 여백에 넓게 걸치는 시식 코너.
      { id: 'tasting-corner', label: '시식 코너', x: 20, y: 61, w: 66, h: 8 },
    ],
  },
  3: {
    // zone 실제 범위(3F): F3-D(2~20,2~39,의류) F3-E(28~56,2~15,잡화/가방)
    //                     F3-C(28~62,18~39,완구/문구) F3-A(62~89,4~55,스포츠/레저)
    //                     F3-B(2~56,42~55,홈/가전)
    // F3-A 최대 x=89라 화장실 라인은 x=91로 한 칸 더 밀었다.
    pitchPx: 20,
    facilities: [
      { type: 'family_restroom', x: 92, y: 26 },
      { type: 'restroom_male', x: 92, y: 30 },
      { type: 'water', x: 92, y: 34 },
      { type: 'restroom_female', x: 92, y: 38 },
      { type: 'escalator_down', x: 92, y: 55 },
      { type: 'elevator', x: 92, y: 60 },
    ],
    serviceAreas: [
      // F3-B(2~56,42~55) 아래(y>55) 여백에 A/S센터 · 가전 체험존 · 휴게 라운지 한 줄로.
      { id: 'as-center', label: 'A/S센터', x: 2, y: 57, w: 15, h: 6 },
      { id: 'appliance-experience', label: '가전 체험존', x: 18, y: 57, w: 29, h: 10 },
      { id: 'lounge', label: '휴게 라운지', x: 48, y: 57, w: 20, h: 10 },
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
