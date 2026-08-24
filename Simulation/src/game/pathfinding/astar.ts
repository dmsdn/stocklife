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
