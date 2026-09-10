// lib/shopping-route-progress.ts
// ✅ 신규(버그 수정 인계 — "동선 안내가 처음으로 돌아가는 오류") — 원인은 에스컬레이터·
//   시설 도착 확인이나 "먼저 들르기"를 누를 때마다 전체 상품을 다시 최적화
//   (getOptimizedRoute)해버려서, 이미 정해진 방문 순서가 매번 새로 섞였던 것.
//
//   이 파일은 그 문제를 "동선을 한 번에 다 보여주는" 현재 UI(scan/page.tsx — 이전/다음
//   안내 없이 전체를 한 화면에 표시)에 맞게 다시 짠 버전입니다. 원래 인계 문서는
//   step/confirmedThrough라는 "지금 보고 있는 안내 단계" 개념이 있었는데, 이 UI엔 그
//   단계 자체가 없어서 그 부분은 가져오지 않았고, 핵심 원칙만 그대로 반영했습니다:
//
//   1) 실제로 스캔해서 상품을 수집하거나(scannedSkuIds 변화) 계획 자체가 바뀌면
//      (상품 추가/삭제) — 전체 재최적화(getOptimizedRoute)가 맞습니다. 방문 순서가
//      바뀌는 게 정상입니다.
//   2) 에스컬레이터 도착이나 "현재 위치만 확인"처럼 위치만 갱신되는 경우, 또는 시설을
//      먼저 들르기로 선택한 경우 — 이미 정해진 나머지 상품 방문 순서(orderedSkuIds)는
//      그대로 두고, 그 순서를 고정한 채로 경로(걷는 길)만 다시 계산합니다
//      (POST /api/navigation/route, stops 순서 고정 — getRoute()).
//   3) 계산 결과는 requestKey(리스트+남은 상품+현재 위치+경유 시설+결제여부 조합)로
//      sessionStorage에 저장해뒀다가, 같은 조건이면 재계산 없이 그대로 재사용합니다
//      (지도 다시 열기·같은 탭 새로고침에도 유지).

"use client";

import { getOptimizedRoute, getRoute, type OptimizedRouteResult, type JourneyStep, type PathPoint, type RouteLeg } from "./navigation";
import type { RouteAnchor } from "./shopping-session";

export const ROUTE_PROGRESS_KEY = "storeflow_shopping_route_progress";
const KEY = ROUTE_PROGRESS_KEY;

export interface ShoppingRouteProgress {
  groupId: number;
  requestKey: string;
  route: OptimizedRouteResult;
  /** ✅ StoreMapDialog(이전/다음 안내가 있는 예전 방식 화면)이 "지금 보고 있는 안내
   *  단계"를 같이 저장해두는 용도. scan/page.tsx(동선을 한 번에 다 보여주는 새 화면)는
   *  이 필드를 안 씀. */
  step?: number;
}

interface RequestKeyParams {
  groupId: number;
  skuIds: number[];
  anchor?: RouteAnchor;
  detourLocationId?: string;
  paid?: boolean;
}

/** ✅ 지금 조건을 문자열 하나로 요약. 같은 값이면 "같은 계획"으로 보고 재계산을 건너뜁니다. */
export function buildRequestKey({ groupId, skuIds, anchor, detourLocationId, paid }: RequestKeyParams): string {
  const sortedIds = [...skuIds].sort((a, b) => a - b).join(",");
  return JSON.stringify({ routeRevision: 2, groupId, sortedIds, anchor: anchor ?? null, detourLocationId: detourLocationId ?? null, paid: !!paid });
}

export function readRouteProgress(groupId: number): ShoppingRouteProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShoppingRouteProgress;
    return parsed.groupId === groupId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRouteProgress(progress: ShoppingRouteProgress) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(progress));
  if (window.parent !== window) window.parent.postMessage({source:"storeflow-frontend",type:"PLANNED_ROUTE",groupId:progress.groupId,route:progress.route}, document.referrer ? new URL(document.referrer).origin : window.location.origin);
}

export function clearRouteProgress(groupId?: number) {
  if (typeof window === "undefined") return;
  if (groupId != null) {
    const current = readRouteProgress(groupId);
    if (!current) return; // 다른 그룹 걸 지우지 않음
  }
  window.sessionStorage.removeItem(KEY);
}

function stopFor(skuId: number) {
  return { skuId };
}

/** getRoute()의 legs(구간별 걷는 길)를 지도가 이해하는 journeySteps 모양으로 바꿉니다.
 *  전체 재최적화(getOptimizedRoute)가 만드는 것과 같은 모양이어야 지도 렌더링 코드를
 *  안 건드리고 그대로 쓸 수 있습니다. */
function legsToJourneySteps(legs: RouteLeg[]): JourneyStep[] {
  return legs.map((leg, i) => ({
    stepIndex: i,
    kind: leg.skuId != null ? "PRODUCT" : leg.locationId != null ? "FACILITY" : "WALK",
    label: leg.label ?? "이동",
    path: leg.path,
    distance: leg.distance,
    skuId: leg.skuId ?? undefined,
    locationId: leg.locationId ?? undefined,
  }));
}

/** 시작점(고정 순서 API는 좌표가 필요 — 전체 재최적화 결과의 start를 그대로 씀). */
function startFrom(route: OptimizedRouteResult): PathPoint {
  return { floorNo: route.start.floorNo, x: route.start.x, y: route.start.y };
}

/** currentRoute의 journeySteps 중 뒤쪽 CHECKOUT/EXIT 같은 "상품이 아닌 마무리 단계"는
 *  위치가 안 바뀌므로 다시 계산할 필요가 없습니다. 이 함수로 그대로 떼어내서 재사용. */
function trailingNonProductSteps(route: OptimizedRouteResult): JourneyStep[] {
  const steps = route.journeySteps;
  let cut = steps.length;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].kind === "PRODUCT") break;
    cut = i;
  }
  return steps.slice(cut);
}

/** ✅ "먼저 들르기" — 시설을 맨 앞에 넣고, 나머지는 지금 route의 순서 그대로 유지한 채
 *  걷는 길만 다시 계산. 요청 사이 모달이 닫히거나 조건이 바뀌면 호출부가 결과를 버려야
 *  하므로, 이 함수 자체는 부작용 없이 결과만 돌려줍니다. */
export async function planFacilityDetour(
  currentRoute: OptimizedRouteResult,
  facilityLocationId: string,
  remainingSkuIds: number[]
): Promise<OptimizedRouteResult> {
  // 현재 route가 이미 알고 있는 순서(orderedSkuIds) 중, 아직 안 스캔한 것만 그 순서 그대로.
  const orderedRemaining = currentRoute.orderedSkuIds.filter((id) => remainingSkuIds.includes(id));
  const stops = [{ locationId: facilityLocationId }, ...orderedRemaining.map(stopFor)];
  const result = await getRoute(startFrom(currentRoute), stops);
  const tail = trailingNonProductSteps(currentRoute);

  return {
    ...currentRoute,
    legs: result.legs,
    totalDistance: result.totalDistance,
    orderedSkuIds: orderedRemaining,
    journeySteps: [...legsToJourneySteps(result.legs), ...tail].map((s, i) => ({ ...s, stepIndex: i })),
    optimizationSource: "fixed-order-detour",
  };
}

/** ✅ "현재 위치만 확인"·에스컬레이터 도착처럼, 남은 상품 방문 "순서"는 그대로 두고
 *  새 위치에서부터 걷는 길만 다시 계산할 때 씁니다. 전체 재최적화와 달리 순서가 안
 *  섞입니다. CHECKOUT/EXIT처럼 위치가 고정된 마무리 단계는 원래 route에서 그대로
 *  이어붙입니다(다시 계산 안 함 — 위치가 안 바뀌니까). */
export async function rebaseRouteFrom(
  currentRoute: OptimizedRouteResult,
  newAnchor: PathPoint,
  remainingSkuIds: number[]
): Promise<OptimizedRouteResult> {
  const orderedRemaining = currentRoute.orderedSkuIds.filter((id) => remainingSkuIds.includes(id));
  const tail = trailingNonProductSteps(currentRoute);
  if (orderedRemaining.length === 0) {
    return { ...currentRoute, journeySteps: tail.map((s, i) => ({ ...s, stepIndex: i })), orderedSkuIds: [] };
  }
  const stops = orderedRemaining.map(stopFor);
  const result = await getRoute(newAnchor, stops);

  return {
    ...currentRoute,
    legs: result.legs,
    totalDistance: result.totalDistance,
    orderedSkuIds: orderedRemaining,
    journeySteps: [...legsToJourneySteps(result.legs), ...tail].map((s, i) => ({ ...s, stepIndex: i })),
    start: { ...newAnchor, label: "현재 위치" },
    optimizationSource: "fixed-order-rebase",
  };
}

// getOptimizedRoute를 재노출 — 호출부가 "전체 재최적화가 필요한 경우"(실제 스캔, 계획
// 변경)와 "순서 유지가 필요한 경우"(위 두 함수)를 한 파일에서 고르게 하기 위함.
export { getOptimizedRoute };
