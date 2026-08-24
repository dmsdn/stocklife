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
}

export const FLOOR_MAPS: FloorMapConfig[] = [
  { floorNo: 1, image: "/maps/floor-1.png", gridWidth: 24, gridHeight: 16 },
];

export function getFloorMap(floorNo: number): FloorMapConfig | undefined {
  return FLOOR_MAPS.find((f) => f.floorNo === floorNo);
}

interface MapCell {
  x: number;
  y: number;
  passable: boolean;
}
interface FloorMapApiResponse {
  floorNo: number;
  zones: { zoneId: string; name: string; zoneType: string }[];
  cells: MapCell[];
}

const realGridCache = new Map<number, boolean[][]>();

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
  } catch {
    // 실패하면 캐시에 안 남기고, 아래 추측 로직으로 계속 동작
  }
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
