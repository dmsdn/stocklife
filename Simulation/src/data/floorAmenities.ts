// DB(storeflow_db)에는 매대(zones/locations/map_cells)만 있고, 화장실·정수기·엘리베이터
// 같은 "매장 편의시설"과 계산대·ATM·시식코너 같은 "서비스 구역"은 스키마에 아예 없다
// (db/schema_v2.sql 참고 — facilities/service_areas 테이블 자체가 없음). 이 값들은 매장
// 도면에서 손으로 뽑아낸 고정 레이아웃이라 DB 연동 여부와 무관하게 프론트에 남겨둔다.
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
    facilities: [{ type: 'elevator', x: 44, y: 37 }],
    serviceAreas: [],
  },
  1: {
    pitchPx: 20,
    facilities: [
      { type: 'family_restroom', x: 52, y: 19 },
      { type: 'restroom_male', x: 52, y: 22 },
      { type: 'water', x: 52, y: 25 },
      { type: 'restroom_female', x: 52, y: 28 },
      { type: 'escalator_up', x: 52, y: 37 },
      { type: 'elevator', x: 48, y: 37 },
    ],
    serviceAreas: [
      { id: 'event-1', label: '행사 상품', x: 18, y: 19, w: 3, h: 10 },
      { id: 'event-2', label: '행사 상품', x: 32, y: 19, w: 10, h: 9 },
      { id: 'checkout', label: '계산대 / SCAN', x: 1, y: 42, w: 16, h: 2 },
      { id: 'atm', label: 'ATM', x: 18, y: 42, w: 3, h: 2 },
      { id: 'bakery-counter', label: '베이커리', x: 22, y: 42, w: 7, h: 2 },
      { id: 'food-court', label: '푸드코트', x: 30, y: 42, w: 14, h: 2 },
      { id: 'customer-center', label: '고객센터', x: 18, y: 45, w: 11, h: 3 },
      { id: 'entrance', label: '입구', x: 1, y: 45, w: 4, h: 2 },
    ],
  },
  2: {
    pitchPx: 20,
    facilities: [
      { type: 'family_restroom', x: 52, y: 19 },
      { type: 'restroom_male', x: 52, y: 22 },
      { type: 'water', x: 52, y: 25 },
      { type: 'restroom_female', x: 52, y: 28 },
      { type: 'escalator_up', x: 51, y: 37 },
      { type: 'escalator_down', x: 52, y: 37 },
      { type: 'elevator', x: 48, y: 37 },
    ],
    serviceAreas: [
      { id: 'event', label: '행사 상품', x: 40, y: 7, w: 8, h: 19 },
      { id: 'optical-hearing-center', label: '안경 / 보청기 센터', x: 2, y: 37, w: 10, h: 3 },
      { id: 'pharmacy', label: '약국', x: 2, y: 40, w: 10, h: 3 },
      { id: 'tasting-corner', label: '시식 코너', x: 14, y: 37, w: 30, h: 5 },
    ],
  },
  3: {
    pitchPx: 20,
    facilities: [
      { type: 'family_restroom', x: 52, y: 19 },
      { type: 'restroom_male', x: 52, y: 22 },
      { type: 'water', x: 52, y: 25 },
      { type: 'restroom_female', x: 52, y: 28 },
      { type: 'escalator_down', x: 52, y: 37 },
      { type: 'elevator', x: 48, y: 37 },
    ],
    serviceAreas: [
      { id: 'as-center', label: 'A/S센터', x: 2, y: 34, w: 9, h: 4 },
      { id: 'appliance-experience', label: '가전 체험존', x: 13, y: 34, w: 17, h: 6 },
      { id: 'lounge', label: '휴게 라운지', x: 32, y: 34, w: 12, h: 6 },
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
