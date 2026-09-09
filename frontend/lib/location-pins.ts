// lib/location-pins.ts
// ✅ 신규(요청) — "핀 위치는 locationId로 좌표 찍는 게 나을걸?" — 백엔드가 주는 실제
//   격자 좌표(x,y)가 지도 이미지랑 정확히 안 맞아서 핀이 엉뚱한 곳에 뜨는 문제가
//   계속 있었습니다. 그래서 백엔드 좌표를 그대로 믿는 대신, 사람이 지도 위에서 직접
//   찍어둔 좌표가 있으면 그걸 우선으로 씁니다.
//
//   레벨(L1~L6)은 같은 랙+베이 안에서 높이(층)만 다르고 x,y는 똑같아서(백엔드
//   Location 엔티티 자체가 그렇게 설계돼 있음 — "같은 랙/베이의 L1~L6은 같은 x,y좌표를
//   공유"), 좌표는 "구역+랙+베이" 단위로만 찍으면 충분합니다 — locationId
//   "F1-G-R01-B01-L1"에서 맨 뒤 레벨만 떼면 "F1-G-R01-B01"이 키가 됩니다.
//
//   지금은 빈 레지스트리입니다 — map-coord-tool.html(또는 그 후속)로 실제 매대 위치를
//   찍어서 여기 채워 넣으면, 그 랙+베이에 있는 모든 상품(레벨 무관)이 자동으로 그
//   좌표를 씁니다. 못 찾은(레지스트리에 없는) 랙+베이는 백엔드가 준 좌표로 그대로
//   대체(fallback)되니, 하나도 안 찍혀 있어도 지금처럼 동작합니다 — 찍은 것부터
//   점진적으로 정확해지는 구조입니다.
export interface PinCoord {
  floorNo: number;
  x: number;
  y: number;
}

/** locationId("F1-G-R01-B01-L1")에서 레벨을 뗀 "구역+랙+베이" 키("F1-G-R01-B01")를 얻음.
 *  형식이 안 맞으면(예상 못 한 값) null. */
export function toRackBayKey(locationId: string): string | null {
  const match = locationId.match(/^(F\d+-[A-Za-z0-9]+-R\d+-B\d+)-L\d+$/);
  return match ? match[1] : null;
}

// ✅ 여기에 실측한 좌표를 채워 넣으세요. 키는 toRackBayKey()가 만드는 형식과 동일해야
//   합니다. 예시(주석 처리, 실제 좌표 아님):
// export const MANUAL_PIN_COORDS: Record<string, PinCoord> = {
//   "F1-G-R01-B01": { floorNo: 1, x: 12.5, y: 4.2 },
// };
export const MANUAL_PIN_COORDS: Record<string, PinCoord> = {};

/** locationId 기준으로 직접 찍어둔 좌표가 있으면 그걸, 없으면 넘겨준 fallback(백엔드
 *  좌표)을 그대로 반환. 핀을 그리는 모든 화면이 이 함수를 거치게 하면, 나중에
 *  MANUAL_PIN_COORDS를 채우기만 해도 전부 한 번에 정확해집니다. */
export function resolvePinCoord(locationId: string, fallback: PinCoord): PinCoord {
  const key = toRackBayKey(locationId);
  if (!key) return fallback;
  return MANUAL_PIN_COORDS[key] ?? fallback;
}
