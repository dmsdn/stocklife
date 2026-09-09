"use client";

import { apiFetch } from "./api-client";
import type { RouteAnchor } from "./shopping-session";

export interface RouteStop { skuId?: number; locationId?: string; label?: string; }
export interface PathPoint { floorNo: number; x: number; y: number; }
export interface RouteLeg {
  stopIndex: number; label: string | null; skuId: number | null; locationId: string | null;
  zoneId: string | null; status: "OK" | "UNRESOLVED" | "UNREACHABLE"; path: PathPoint[]; distance: number;
}
export interface RouteResult { legs: RouteLeg[]; totalDistance: number; }
export interface JourneyStep {
  stepIndex: number; kind: "PRODUCT" | "WALK" | "ESCALATOR" | "FACILITY" | "CHECKOUT" | "EXIT";
  label: string; path: PathPoint[]; distance: number; skuId?: number; locationId?: string;
  coldLabel?: string; anchor?: RouteAnchor;
}
export interface OptimizedRouteResult extends RouteResult {
  orderedSkuIds: number[]; floorOrder: number[]; start: PathPoint & {label: string};
  originalDistance: number | null; savedDistance: number | null;
  excluded: {skuId: number; reason: string}[]; optimizationSource: string;
  journeySteps: JourneyStep[]; optimal: boolean; methodLabel: string; paid: boolean;
  facilities: (PathPoint & {locationId: string; label: string})[];
}
export async function getOptimizedRoute(
  skuIds: number[],
  options: {anchor?: RouteAnchor; detourLocationId?: string; paid?: boolean} = {}
): Promise<OptimizedRouteResult> {
  const result = await apiFetch<OptimizedRouteResult & {error?: string; message?: string}>(
    "/api/ai/route-optimize",
    { method: "POST", auth: false, body: JSON.stringify({skuIds, ...options}) }
  );
  if (result.error) throw new Error(result.message ?? "구매 동선을 계산하지 못했어요.");
  return result;
}
export async function getRoute(start: PathPoint, stops: RouteStop[]): Promise<RouteResult> {
  return apiFetch<RouteResult>("/api/navigation/route", {
    method: "POST", auth: false,
    body: JSON.stringify({startFloor: start.floorNo, startX: start.x, startY: start.y, stops}),
  });
}
