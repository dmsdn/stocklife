// lib/pathfinding.ts
// ✅ A* — 흰 통로(walkable grid)만 따라가는 실제 경로. 상품 칸 자체는 진열대(막힘)라서,
//   가장 가까운 통로 칸까지 붙여서 계산합니다.
import { isWalkable, getFloorMap } from "./map-config";

export interface GridPoint {
  x: number;
  y: number;
}

function key(p: GridPoint) {
  return `${p.x},${p.y}`;
}

function neighbors(p: GridPoint): GridPoint[] {
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ];
}

function heuristic(a: GridPoint, b: GridPoint) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** 진열대 칸(막힘)이면 가장 가까운 통로 칸을 찾아줌 — 상품 위치 자체가 진열대라서 필요 */
export function nearestWalkable(floorNo: number, point: GridPoint): GridPoint {
  if (isWalkable(floorNo, point.x, point.y)) return point;

  const visited = new Set<string>([key(point)]);
  let queue: GridPoint[] = [point];

  while (queue.length > 0) {
    const next: GridPoint[] = [];
    for (const p of queue) {
      for (const n of neighbors(p)) {
        if (visited.has(key(n))) continue;
        visited.add(key(n));
        if (isWalkable(floorNo, n.x, n.y)) return n;
        next.push(n);
      }
    }
    queue = next;
    if (visited.size > 2000) break; // 안전장치
  }
  return point;
}

/** A* — 통로 격자 위에서만 이동하는 실제 경로(격자 좌표 배열) 반환 */
export function findPath(floorNo: number, start: GridPoint, end: GridPoint): GridPoint[] {
  const config = getFloorMap(floorNo);
  if (!config) return [start, end];

  const startWalk = nearestWalkable(floorNo, start);
  const endWalk = nearestWalkable(floorNo, end);

  const openSet = new Map<string, GridPoint>([[key(startWalk), startWalk]]);
  const cameFrom = new Map<string, GridPoint>();
  const gScore = new Map<string, number>([[key(startWalk), 0]]);
  const fScore = new Map<string, number>([[key(startWalk), heuristic(startWalk, endWalk)]]);

  const visited = new Set<string>();

  while (openSet.size > 0) {
    let currentKey = "";
    let currentScore = Infinity;
    for (const [k, v] of openSet) {
      const f = fScore.get(k) ?? Infinity;
      if (f < currentScore) {
        currentScore = f;
        currentKey = k;
      }
    }
    const current = openSet.get(currentKey)!;
    openSet.delete(currentKey);
    visited.add(currentKey);

    if (current.x === endWalk.x && current.y === endWalk.y) {
      const path: GridPoint[] = [current];
      let k = currentKey;
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k)!;
        path.unshift(prev);
        k = key(prev);
      }
      return [start, ...path, end];
    }

    for (const n of neighbors(current)) {
      if (!isWalkable(floorNo, n.x, n.y)) continue;
      const nKey = key(n);
      if (visited.has(nKey)) continue;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + heuristic(n, endWalk));
        if (!openSet.has(nKey)) openSet.set(nKey, n);
      }
    }

    if (visited.size > 3000) break; // 안전장치 — 경로 못 찾으면 직선으로 대체
  }

  return [start, end]; // 경로를 못 찾았을 때의 폴백(직선)
}
