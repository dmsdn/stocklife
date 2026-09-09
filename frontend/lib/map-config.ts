// lib/map-config.ts
// public/maps/MAP_GUIDE.md 참고.
// ✅ 실제 GET /api/map/floors/{floorNo}를 연동했습니다. 이 API가 각 칸(x,y)이 통로인지
//   (passable)를 실제로 알려줘서, 더 이상 추측 안 합니다. 페이지가 fetchRealFloorMap()을
//   먼저 호출해서 캐시를 채워두면 isWalkable/getWalkableGrid가 그 실제 값을 씁니다 —
//   아직 못 불러왔으면(초기 렌더 등) 기존 추측 로직으로 잠깐 대체합니다.
import { apiFetch } from "./api-client";

export interface FloorMapConfig {
  floorNo: number;
  image: string;
  gridWidth: number;
  gridHeight: number;
  /** ✅ 신규 — 이미지의 실제 픽셀 크기. 화면의 지도 박스는 세로로 긴 모바일 비율인데
   *  실제 지도 이미지 비율(가로:세로)은 이거랑 다르기 때문에, object-contain으로 표시하면
   *  위아래(또는 좌우)에 레터박스 여백이 생긴다. 이 값으로 "지금 이 박스 안에서 이미지가
   *  실제로 어디에 얼마 크기로 떠 있는지"를 계산해서, 좌표(%)가 박스 전체가 아니라
   *  실제 이미지 위치 기준으로 맞게 보정한다. */
  imageWidth: number;
  imageHeight: number;
  /** ✅ 신규 — 지도 이미지를 해상도 개선하면서 상단 회색 여백(층 표시 텍스트 있던 부분)을
   *  잘라냈는데, 기존 좌표(핀·통로·매대)는 전부 "잘리기 전 이미지" 기준 퍼센트로 계산돼
   *  있어서, 새 이미지에 그대로 쓰면 위로 밀려 보입니다. 이 값(잘리기 전 이미지에서 회색
   *  여백이 차지하던 비율, %)만큼 보정해서 새 이미지에서도 기존 좌표가 그대로 맞게 함 —
   *  나중에 좌표를 새 이미지 기준으로 다시 찍으면 이 값을 0으로 돌리면 됩니다. */
  legacyTopOffsetPercent?: number;
}

export const FLOOR_MAPS: FloorMapConfig[] = [
  { floorNo: 1, image: "/maps/floor-1.png", gridWidth: 24, gridHeight: 16, imageWidth: 3836, imageHeight: 3200, legacyTopOffsetPercent: 0 },
  { floorNo: 2, image: "/maps/floor-2.png", gridWidth: 24, gridHeight: 16, imageWidth: 3836, imageHeight: 3020, legacyTopOffsetPercent: 0 },
  { floorNo: 3, image: "/maps/floor-3.png", gridWidth: 24, gridHeight: 16, imageWidth: 3836, imageHeight: 3020, legacyTopOffsetPercent: 0 },
];

export function getFloorMap(floorNo: number): FloorMapConfig | undefined {
  return FLOOR_MAPS.find((f) => f.floorNo === floorNo);
}

interface MapCell {
  x: number;
  y: number;
  passable: boolean;
}
interface MapLocation {
  locationId: string;
  zoneId: string;
  x: number;
  y: number;
}

/** ✅ "매대 색마다 눌러도 반응이 없는" 문제의 원인: 개별 매대 클릭 영역
 *  (getFloorLocations)은 백엔드 locations 시드가 있어야만 생기는데, zones(구역
 *  이름/색상 단위) 시드는 있어도 locations(칸 하나하나의 좌표) 시드가 비어있으면
 *  지도 위에 누를 수 있는 버튼 자체가 하나도 안 생김. 그래서 locations 유무와 무관하게
 *  항상 누를 수 있는 "구역 전체" 큰 클릭 영역을 하나 더 깐다.
 *  ✅ 수정(2026-09) — 실제 이미지 위에 격자를 겹쳐서 눈으로 보며 정밀하게 재측정한 값으로
 *  교체(소수점 단위, 칸 스냅 아님 — 렌더링이 그냥 나눗셈이라 문제없음). 1~3층 전부 실제
 *  GET /api/map/floors/{floorNo} 응답의 zoneId와 대조해서 확인한 값. 같은 구역이 이미지
 *  위에서 여러 조각(L자 등)으로 나뉘어 보이는 곳은 같은 zoneId로 사각형을 여러 개 등록해
 *  커버한다 — 클릭 판정은 zoneId 기준이라 여러 조각이어도 항상 같은 이름 팝업이 뜬다.
 *  다른 zoneId끼리는 서로 겹치지 않게(겹치면 배열상 나중 항목이 클릭을 가로챔) 확인 완료.
 */
interface ZoneRegion {
  zoneId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const ZONE_REGIONS: Record<number, ZoneRegion[]> = {
  1: [
    { zoneId: "F1-F", x1: 0, y1: 0, x2: 9.75, y2: 4 },
    { zoneId: "F1-D", x1: 0, y1: 4, x2: 9.25, y2: 5.25 },
    { zoneId: "F1-D", x1: 0, y1: 5.25, x2: 6.25, y2: 8 },
    { zoneId: "F1-A", x1: 0, y1: 8, x2: 9.5, y2: 12.5 },
    { zoneId: "F1-B", x1: 9.5, y1: 9.75, x2: 16, y2: 13.5 },
    { zoneId: "F1-C", x1: 16, y1: 9, x2: 22.25, y2: 13.5 },
    { zoneId: "F1-E", x1: 9.5, y1: 4.75, x2: 16, y2: 9.75 },
    { zoneId: "F1-H", x1: 16, y1: 4.5, x2: 21.5, y2: 5.5 },
    { zoneId: "F1-H", x1: 14.75, y1: 0, x2: 22, y2: 4.75 },
    { zoneId: "F1-G", x1: 9.75, y1: 0, x2: 14.75, y2: 4.75 },
  ],
  2: [
    { zoneId: "F2-A", x1: 20, y1: 8, x2: 22.25, y2: 10.5 },
    { zoneId: "F2-A", x1: 11.5, y1: 9.5, x2: 22.25, y2: 13.25 },
    { zoneId: "F2-B", x1: 0.25, y1: 8, x2: 11.5, y2: 13.25 },
    { zoneId: "F2-C", x1: 11.5, y1: 4.5, x2: 18, y2: 9.5 },
    { zoneId: "F2-D", x1: 0.25, y1: 4.5, x2: 11.5, y2: 8 },
    { zoneId: "F2-F", x1: 0, y1: 0, x2: 10.25, y2: 4.5 },
    { zoneId: "F2-E", x1: 10.25, y1: 0, x2: 20.5, y2: 4.5 },
  ],
  3: [
    { zoneId: "F3-A", x1: 16.75, y1: 0, x2: 22, y2: 10.75 },
    { zoneId: "F3-A", x1: 20.5, y1: 0, x2: 24, y2: 6 },
    { zoneId: "F3-B", x1: 2.5, y1: 8.75, x2: 15.25, y2: 12.5 },
    { zoneId: "F3-B", x1: 0, y1: 8.75, x2: 3.75, y2: 10.75 },
    { zoneId: "F3-A", x1: 15.25, y1: 8.75, x2: 22, y2: 12.5 },
    { zoneId: "F3-C", x1: 6.5, y1: 3.5, x2: 16.75, y2: 8.75 },
    { zoneId: "F3-E", x1: 0, y1: 0, x2: 6.5, y2: 8.75 },
    { zoneId: "F3-F", x1: 6.5, y1: 0, x2: 15.5, y2: 3.5 },
  ],
};

export function getZoneRegions(floorNo: number): ZoneRegion[] {
  return ZONE_REGIONS[floorNo] ?? [];
}

interface FloorMapApiResponse {
  floorNo: number;
  zones: { zoneId: string; name: string; zoneType: string }[];
  cells: MapCell[];
  locations: MapLocation[];
}

const realGridCache = new Map<number, boolean[][]>();
// ✅ zoneId -> zone 이름(예: "유제품 코너"). 배치 위치 조회에서 받은 zoneId를 사람이 읽을
//   텍스트로 바꾸려면 필요. fetchRealFloorMap()이 통로 격자를 캐싱할 때 같이 채운다.
const zoneNameCache = new Map<number, Map<string, string>>();
// ✅ 매대 좌표 전체 목록(locationId/x/y) — "아무 매대나 눌러서 그 안의 상품 보기" 기능용.
const locationsCache = new Map<number, MapLocation[]>();

/** 실제 지도 데이터를 미리 불러와서 캐시를 채웁니다 (컴포넌트 마운트 시 호출) */
export async function fetchRealFloorMap(floorNo: number): Promise<void> {
  if (realGridCache.has(floorNo)) return;
  try {
    const res = await apiFetch<FloorMapApiResponse>(`/api/map/floors/${floorNo}`);
    const config = getFloorMap(floorNo);
    const width = config?.gridWidth ?? Math.max(...res.cells.map((c) => c.x)) + 1;
    const height = config?.gridHeight ?? Math.max(...res.cells.map((c) => c.y)) + 1;
    const grid: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
    for (const cell of res.cells) {
      if (cell.y < height && cell.x < width) grid[cell.y][cell.x] = cell.passable;
    }
    realGridCache.set(floorNo, grid);

    const zoneNames = new Map<string, string>();
    for (const zone of res.zones) zoneNames.set(zone.zoneId, zone.name);
    zoneNameCache.set(floorNo, zoneNames);

    locationsCache.set(floorNo, res.locations ?? []);
  } catch {
    // 실패하면 캐시에 안 남기고, 아래 추측 로직으로 계속 동작
  }
}

/** 그 층의 매대 좌표 전체 목록. fetchRealFloorMap()을 먼저 불러야 채워집니다(못 불러왔으면 빈 배열). */
export function getFloorLocations(floorNo: number): MapLocation[] {
  return locationsCache.get(floorNo) ?? [];
}

/** zoneId로 사람이 읽을 zone 이름을 찾습니다. fetchRealFloorMap()을 먼저 불러야 채워집니다.
 *  못 찾으면(아직 못 불러왔거나 없는 zoneId) null. */
export function getZoneName(floorNo: number, zoneId: string): string | null {
  return zoneNameCache.get(floorNo)?.get(zoneId) ?? null;
}

// ⚠ 실제 데이터를 아직 못 불러왔을 때만 쓰는 추측 로직(폴백).
const AISLE_ROWS = new Set([0, 1, 2, 9, 10, 11, 14, 15]);

function guessIsWalkable(floorNo: number, x: number, y: number): boolean {
  const config = getFloorMap(floorNo);
  if (!config) return false;
  if (x < 0 || x >= config.gridWidth || y < 0 || y >= config.gridHeight) return false;
  if (x === 0 || x === config.gridWidth - 1) return true;
  return AISLE_ROWS.has(y);
}

export function isWalkable(floorNo: number, x: number, y: number): boolean {
  const real = realGridCache.get(floorNo);
  if (real) return real[y]?.[x] ?? false;
  return guessIsWalkable(floorNo, x, y);
}

export function getWalkableGrid(floorNo: number): boolean[][] {
  const real = realGridCache.get(floorNo);
  if (real) return real;

  const config = getFloorMap(floorNo);
  if (!config) return [];
  const grid: boolean[][] = [];
  for (let y = 0; y < config.gridHeight; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < config.gridWidth; x++) {
      row.push(guessIsWalkable(floorNo, x, y));
    }
    grid.push(row);
  }
  return grid;
}