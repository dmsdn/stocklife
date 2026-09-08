// 백엔드 POST /api/navigation/cart-route 연동.
// (09-08: com.storeflow.navigation.service.CartRouteService — DB map_cells 기반 실제 A*,
// 층간 이동(엘리베이터/에스컬레이터), Held-Karp TSP로 이미 구현되어 있던 것을 그대로 사용한다.
// 여기서 다시 경로를 계산하지 않는다 — 백엔드가 준 path를 그대로 그리기만 하면 된다.)

export interface RouteStop {
    skuId: number;
    name: string;
    locationId: string;
    floor: number;
    x: number;
    y: number;
}

export interface RoutePathPoint {
    floor: number;
    x: number;
    y: number;
}

export interface CartRoute {
    cartGroupId: number;
    totalDistance: number;
    stops: RouteStop[];
    path: RoutePathPoint[]; // 층 이동 구간까지 포함된 전체 경로. 화면엔 현재 층에 해당하는 구간만 필터링해서 그린다.
}

interface FetchCartRouteArgs {
    token: string; // Authorization 헤더에 실을 JWT(Bearer 없이)
    floor: number; // 캐릭터가 지금 있는 층
    x: number;
    y: number;
    groupId?: number; // 생략하면 백엔드가 "기본 장바구니"를 사용
}

export async function fetchCartRoute({ token, floor, x, y, groupId }: FetchCartRouteArgs): Promise<CartRoute> {
    const res = await fetch('/api/navigation/cart-route', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ floor, x, y, groupId: groupId ?? null }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`동선 조회 실패(${res.status}): ${text}`);
    }
    return res.json();
}

/** path 전체 중 지금 로드된 층(currentFloor)에 해당하는 연속 구간만 뽑아낸다. */
export function pathPointsOnFloor(path: RoutePathPoint[], currentFloor: number): { x: number; y: number }[] {
    return path.filter((p) => p.floor === currentFloor).map((p) => ({ x: p.x, y: p.y }));
}