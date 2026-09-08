// 백엔드 GET /api/cart/groups/{groupId}/route 연동.
// 백엔드는 "몇 번째로 어느 매대를 들를지"만 정해주고(TSP 근사), 실제 통행 가능 경로는
// 프론트가 astar.ts의 Grid/findPath로 이어붙인다(StoreScene.drawRoute 참고).

export interface RouteStop {
    order: number;
    skuId: number;
    productName: string;
    locationId: string;
    floorNo: number;
    x: number;
    y: number;
}

export interface CartRoute {
    stops: RouteStop[];
    totalDistanceCells: number;
    multiFloor: boolean;
}

interface FetchCartRouteArgs {
    groupId: number;
    token: string; // Authorization 헤더에 실을 JWT(Bearer 없이)
    startFloor?: number;
    startX?: number;
    startY?: number;
}

export async function fetchCartRoute({
                                         groupId,
                                         token,
                                         startFloor,
                                         startX,
                                         startY,
                                     }: FetchCartRouteArgs): Promise<CartRoute> {
    const params = new URLSearchParams();
    if (startFloor !== undefined) params.set('startFloor', String(startFloor));
    if (startX !== undefined) params.set('startX', String(startX));
    if (startY !== undefined) params.set('startY', String(startY));

    const qs = params.toString();
    const res = await fetch(`/api/cart/groups/${groupId}/route${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        throw new Error(`동선 조회 실패: ${res.status}`);
    }
    return res.json();
}