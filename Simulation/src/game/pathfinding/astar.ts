// 그리드 기반 A* 최단경로. FloorData.occupied(매대 칸)를 장애물로 사용한다.
// 손님 캐릭터의 "최단거리 안내"와 NPC의 "재고 있는 매대까지 이동"이 모두 이 함수를 공유한다 —
// 나중에 화장실/식사 같은 중간 경유지 삽입도 waypoints 배열에 좌표를 추가해서
// findPath(start, wp1) + findPath(wp1, wp2) + ... 로 이어붙이면 된다.

import type { GridPoint } from '../types';

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

function key(x: number, y: number) {
  return `${x},${y}`;
}

function heuristic(a: GridPoint, b: GridPoint) {
  // 맨해튼 거리 — 4방향 이동에 적합 (대각선 이동을 허용하면 옥타일 거리로 교체)
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export class Grid {
  width: number;
  height: number;
  blocked: Set<string>;

  constructor(width: number, height: number, occupied: [number, number][]) {
    this.width = width;
    this.height = height;
    this.blocked = new Set(occupied.map(([x, y]) => key(x, y)));
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return !this.blocked.has(key(x, y));
  }

  /**
   * 목표 칸 주변에서 걸어갈 수 있는 칸들을 가까운 순서로 모은다.
   *
   * nearestWalkableTo()가 바로 옆 8칸만 보는 것과 달리, 반지름을 1칸씩 넓혀가며 찾는다.
   * 매대는 여러 칸에 걸친 덩어리라서 덩어리 한가운데를 클릭하면 8칸이 전부 매대다.
   * 그때 nearestWalkableTo()는 null을 돌려주고, 호출부가 막힌 칸을 그대로 목적지로 쓰면
   * A*는 영원히 도달하지 못해 "경로를 찾지 못했습니다"가 된다(층간 이동에서 이 증상이 보였다).
   *
   * 여러 개를 돌려주는 이유는, 가장 가까운 칸이 벽 반대편처럼 실제로는 갈 수 없는 자리일
   * 수 있기 때문이다. 호출부가 앞에서부터 하나씩 경로를 시도해 보면 된다.
   */
  walkableCellsNear(target: GridPoint, maxRadius = 6, limit = 8): GridPoint[] {
    const found: GridPoint[] = [];
    if (this.isWalkable(target.x, target.y)) found.push({ x: target.x, y: target.y });

    for (let r = 1; r <= maxRadius && found.length < limit; r++) {
      const ring: GridPoint[] = [];
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          // 지금 반지름의 테두리만 본다(안쪽은 이전 반복에서 이미 검사했다).
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = target.x + dx, ny = target.y + dy;
          if (this.isWalkable(nx, ny)) ring.push({ x: nx, y: ny });
        }
      }
      // 같은 테두리 안에서는 실제 거리가 짧은 것부터.
      ring.sort((a, b) =>
          (Math.abs(a.x - target.x) + Math.abs(a.y - target.y)) -
          (Math.abs(b.x - target.x) + Math.abs(b.y - target.y)));
      for (const c of ring) {
        if (found.length >= limit) break;
        found.push(c);
      }
    }
    return found;
  }

  // 매대 칸 바로 옆(인접 통로 칸)을 찾는다 — "그 매대 앞에 도착"의 목표 지점 계산용.
  nearestWalkableTo(target: GridPoint): GridPoint | null {
    if (this.isWalkable(target.x, target.y)) return target;
    const deltas = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
      [-1, -1], [1, -1], [-1, 1], [1, 1],
    ];
    for (const [dx, dy] of deltas) {
      const nx = target.x + dx, ny = target.y + dy;
      if (this.isWalkable(nx, ny)) return { x: nx, y: ny };
    }
    return null;
  }
}

export function findPath(grid: Grid, start: GridPoint, goal: GridPoint): GridPoint[] {
  const open = new Map<string, Node>();
  const closed = new Set<string>();

  const startNode: Node = { x: start.x, y: start.y, g: 0, h: heuristic(start, goal), f: 0, parent: null };
  startNode.f = startNode.g + startNode.h;
  open.set(key(start.x, start.y), startNode);

  const neighbors4 = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
  ];

  let iterations = 0;
  const maxIterations = grid.width * grid.height * 4;

  while (open.size > 0 && iterations < maxIterations) {
    iterations++;
    let current: Node | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.x === goal.x && current.y === goal.y) {
      const path: GridPoint[] = [];
      let n: Node | null = current;
      while (n) {
        path.unshift({ x: n.x, y: n.y });
        n = n.parent;
      }
      return path;
    }

    open.delete(key(current.x, current.y));
    closed.add(key(current.x, current.y));

    for (const [dx, dy] of neighbors4) {
      const nx = current.x + dx, ny = current.y + dy;
      const k = key(nx, ny);
      if (closed.has(k)) continue;
      if (!grid.isWalkable(nx, ny)) continue;

      const g = current.g + 1;
      const existing = open.get(k);
      if (!existing || g < existing.g) {
        const h = heuristic({ x: nx, y: ny }, goal);
        const node: Node = { x: nx, y: ny, g, h, f: g + h, parent: current };
        open.set(k, node);
      }
    }
  }

  return []; // 경로 없음
}
