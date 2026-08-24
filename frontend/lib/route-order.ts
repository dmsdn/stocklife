// lib/route-order.ts
// ⚠ 지금은 실제 백엔드 동선 API(POST /api/navigation/route) 대신, 목업 좌표로 프론트에서
//   직접 계산합니다 — 실제 상품 데이터가 아니라서 백엔드 API를 불러도 위치를 못 찾습니다.
//   실제 상품 좌표가 생기면 이 함수 호출 부분을 lib/navigation.ts의 getRoute()로 바꾸면 됩니다.
// 알고리즘은 단순 최근접 이웃(nearest neighbor) — 최적 경로는 아니지만 매장 동선 데모용으로는 충분합니다.
export interface RoutePoint {
  id: number;
  x: number;
  y: number;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function computeNearestNeighborOrder(start: { x: number; y: number }, points: RoutePoint[]): number[] {
  const remaining = [...points];
  const order: number[] = [];
  let current = start;

  while (remaining.length > 0) {
    remaining.sort((a, b) => dist(current, a) - dist(current, b));
    const next = remaining.shift()!;
    order.push(next.id);
    current = next;
  }

  return order;
}
