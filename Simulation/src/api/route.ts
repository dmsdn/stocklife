// 백엔드 POST /api/navigation/route 연동.
// (com.storeflow.navigation.controller.RouteController → NavigationService, DB map_cells
// 기반 A*. "로그인 여부와 무관하게 좌표 계산만 하는 순수 기능이라 인증을 요구하지 않는다"
// — 컨트롤러 주석 그대로. 오른쪽 Next.js 화면(StoreMapDialog/RouteDialog)이 이미 쓰고 있는
// 바로 그 엔드포인트를 시뮬레이션도 그대로 재사용한다. 여기서 다시 경로를 계산하지 않고,
// 백엔드가 준 path를 그대로 이어 그리기만 한다.
//
// 방문 순서는 이 API가 정하지 않고 요청에 담긴 stops 순서 그대로 처리하므로, 순서는
// 호출하는 쪽(App.tsx)이 정해서 넘긴다 — 지금은 카트 그룹에 담긴 순서 그대로 사용한다.

export interface RouteStopInput {
    skuId: number;
    name: string;
}

export interface RouteStop {
    skuId: number | null;
    name: string | null;
    locationId: string | null;
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
    totalDistance: number;
    stops: RouteStop[];
    path: RoutePathPoint[]; // 층 이동 구간까지 포함된 전체 경로. 화면엔 현재 층에 해당하는 구간만 필터링해서 그린다.
    unresolvedCount: number; // 위치를 못 찾았거나(품절 등) 갈 수 없었던 상품 수 — 안내 메시지용.
}

interface FetchCartRouteArgs {
    floor: number; // 캐릭터가 지금 있는 층
    x: number;
    y: number;
    items: RouteStopInput[]; // 방문할 상품들 (카트 그룹에 담긴 순서 그대로)
}

interface BackendPathPoint {
    floorNo: number;
    x: number;
    y: number;
}

interface BackendLeg {
    stopIndex: number;
    label: string | null;
    skuId: number | null;
    locationId: string | null;
    zoneId: string | null;
    status: 'OK' | 'UNRESOLVED' | 'UNREACHABLE';
    path: BackendPathPoint[];
    distance: number;
}

interface BackendRouteResponse {
    legs: BackendLeg[];
    totalDistance: number;
}

export async function fetchCartRoute({ floor, x, y, items }: FetchCartRouteArgs): Promise<CartRoute> {
    const res = await fetch('/api/navigation/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            startFloor: floor,
            startX: x,
            startY: y,
            stops: items.map((it) => ({ skuId: it.skuId, label: it.name })),
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`동선 조회 실패(${res.status}): ${text}`);
    }
    const data: BackendRouteResponse = await res.json();

    const stops: RouteStop[] = [];
    const path: RoutePathPoint[] = [];
    let unresolvedCount = 0;

    for (const leg of data.legs) {
        if (leg.status !== 'OK' || leg.path.length === 0) {
            unresolvedCount++;
            continue;
        }
        // 첫 칸은 이전 leg의 마지막 칸과 겹치므로(이미 그려진 좌표) 두 번째 leg부터는 제외한다.
        const startIdx = path.length === 0 ? 0 : 1;
        for (let i = startIdx; i < leg.path.length; i++) {
            const p = leg.path[i];
            path.push({ floor: p.floorNo, x: p.x, y: p.y });
        }
        const last = leg.path[leg.path.length - 1];
        stops.push({
            skuId: leg.skuId,
            name: leg.label,
            locationId: leg.locationId,
            floor: last.floorNo,
            x: last.x,
            y: last.y,
        });
    }

    return { totalDistance: data.totalDistance, stops, path, unresolvedCount };
}

/** path 전체 중 지금 로드된 층(currentFloor)에 해당하는 연속 구간만 뽑아낸다. */
export function pathPointsOnFloor(path: RoutePathPoint[], currentFloor: number): { x: number; y: number }[] {
    return path.filter((p) => p.floor === currentFloor).map((p) => ({ x: p.x, y: p.y }));
}