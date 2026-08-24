// 층간 이동 수단 연결 규칙.
// 엘리베이터 = 모든 층 직행 가능. 에스컬레이터 = 인접한 층끼리만, 중간층을 반드시 거쳐야 함.
// B1(지하)은 에스컬레이터가 없다고 가정 — 실제 매장도 지하 물류창고는 화물용 엘리베이터만 쓰는 경우가 많음.

export const ALL_FLOORS = [0, 1, 2, 3]; // 0 = B1

export const ELEVATOR_FLOORS = [0, 1, 2, 3]; // 엘리베이터가 서는 층 전부

// 에스컬레이터로 연결된 (아래층, 위층) 쌍. 이 배열의 인접 관계만 한 번에 오갈 수 있다.
export const ESCALATOR_PAIRS: [number, number][] = [
  [1, 2],
  [2, 3],
];

export function floorLabel(floor: number): string {
  return floor === 0 ? 'B1' : `${floor}F`;
}

// 에스컬레이터만 이용할 때, start~end 사이를 거쳐야 하는 층 순서를 계산.
// 연결이 끊겨 있으면(B1 포함 등) null 반환.
export function escalatorRoute(start: number, end: number): number[] | null {
  if (start === end) return [start];
  const adj = new Map<number, number[]>();
  for (const [a, b] of ESCALATOR_PAIRS) {
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  // BFS
  const queue: number[][] = [[start]];
  const visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    if (last === end) return path;
    for (const next of adj.get(last) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}

export function canUseElevator(start: number, end: number): boolean {
  return ELEVATOR_FLOORS.includes(start) && ELEVATOR_FLOORS.includes(end);
}
