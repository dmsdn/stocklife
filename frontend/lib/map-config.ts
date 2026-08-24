// lib/map-config.ts
// public/maps/MAP_GUIDE.md 참고.
// ✅ walkableGrid 추가 — 통로(true)/진열대(false)를 칸 단위로 정의해서, 동선이 진열대를
//   가로지르지 않고 흰 통로만 따라가도록 lib/pathfinding.ts에서 씁니다.
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

// ⚠ 실제 지도 이미지가 생기면, 이 격자도 그 그림에 실제로 그려진 통로 위치에 맞춰
//   다시 그려야 합니다. 지금은 "위/가운데/아래 가로 통로 + 좌우 끝 세로 통로" 구조로
//   임의로 잡아뒀습니다(상품 좌표들이 전부 이 통로를 피해서 진열대 칸에 들어가도록
//   미리 맞춰뒀습니다).
const AISLE_ROWS = new Set([0, 1, 2, 9, 10, 11, 14, 15]);

export function isWalkable(floorNo: number, x: number, y: number): boolean {
  const config = getFloorMap(floorNo);
  if (!config) return false;
  if (x < 0 || x >= config.gridWidth || y < 0 || y >= config.gridHeight) return false;

  // 좌우 끝 세로 통로(모든 구역을 잇는 스파인)
  if (x === 0 || x === config.gridWidth - 1) return true;

  // 가로 통로 밴드
  return AISLE_ROWS.has(y);
}

export function getWalkableGrid(floorNo: number): boolean[][] {
  const config = getFloorMap(floorNo);
  if (!config) return [];
  const grid: boolean[][] = [];
  for (let y = 0; y < config.gridHeight; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < config.gridWidth; x++) {
      row.push(isWalkable(floorNo, x, y));
    }
    grid.push(row);
  }
  return grid;
}
