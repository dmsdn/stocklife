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
    anchor?: {skuId:number};
    groupId?: number;
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

export function routeFromPlan(data: {journeySteps: {kind:string;skuId?:number;locationId?:string;label:string;path:BackendPathPoint[]}[];totalDistance:number;excluded?:unknown[]}): CartRoute {
 const stops: RouteStop[]=[]; const path: RoutePathPoint[]=[];
 for(const step of data.journeySteps) {
  for(const p of step.path) { const last=path[path.length-1]; if(!last || last.floor!==p.floorNo || last.x!==p.x || last.y!==p.y) path.push({floor:p.floorNo,x:p.x,y:p.y}); }
  const end=step.path[step.path.length-1];
  if(end && step.kind!=='WALK' && step.kind!=='ESCALATOR') stops.push({skuId:step.skuId??null,name:step.label,locationId:step.locationId??null,floor:end.floorNo,x:end.x,y:end.y});
 }
 return {stops,path,totalDistance:data.totalDistance,unresolvedCount:data.excluded?.length??0};
}
export async function fetchCartRoute({items, anchor, groupId}: FetchCartRouteArgs): Promise<CartRoute> {
 const skuIds=[...new Set(items.map(i=>i.skuId))];
 let paid=false;
 let currentAnchor: unknown=anchor;
 let detourLocationId: string | undefined;
 try {
  const session=JSON.parse(sessionStorage.getItem('storeflow_shopping_session')??'null');
  if(groupId!=null && session?.groupId===groupId) {
   paid=session.paid===true;
   currentAnchor=anchor??session.anchor;
   detourLocationId=session.detourLocationId??undefined;
  }
 } catch { /* No matching active session. */ }
 try {
  const saved=JSON.parse(sessionStorage.getItem('storeflow_shopping_route_progress')??'null');
  const ids=[...(saved?.route?.orderedSkuIds??[]),...(saved?.route?.excluded??[]).map((e:{skuId:number})=>e.skuId)];
  if(saved?.route && saved.groupId===groupId && !anchor && saved.route.paid===paid && !currentAnchor && ids.length===skuIds.length && ids.every((id:number)=>skuIds.includes(id))) return routeFromPlan(saved.route);
 } catch { /* No shared plan yet. */ }
 const res=await fetch('/api/ai/route-optimize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({skuIds,anchor:currentAnchor,paid,detourLocationId})});
 if(!res.ok) throw new Error(`동선 조회 실패(${res.status})`);
 const data=await res.json(); if(data.error) throw new Error(data.message??data.error);
 return routeFromPlan(data);
}

/** path 전체 중 지금 로드된 층(currentFloor)에 해당하는 연속 구간만 뽑아낸다. */
export function pathPointsOnFloor(path: RoutePathPoint[], currentFloor: number): { x: number; y: number }[] {
    return path.filter((p) => p.floor === currentFloor).map((p) => ({ x: p.x, y: p.y }));
}