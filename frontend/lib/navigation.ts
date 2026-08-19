// lib/navigation.ts
// ✅ POST /api/navigation/route — 새로 생긴 매장 동선(A* 경로탐색) API 래퍼.
// 목적지는 skuId(재고 위치를 서버가 자동으로 찾음) 또는 locationId(직접 지정) 중 하나로 지정.
// 방문 순서는 이 API가 정하지 않음 — 배열 순서 그대로 앞에서부터 계산합니다.
"use client";

import { apiFetch } from "./api-client";

export interface RouteStop {
  skuId?: number;
  locationId?: string;
  label?: string;
}

export interface PathPoint {
  floorNo: number;
  x: number;
  y: number;
}

export interface RouteLeg {
  stopIndex: number;
  label: string | null;
  skuId: number | null;
  locationId: string | null;
  zoneId: string | null;
  status: "OK" | "UNRESOLVED" | "UNREACHABLE";
  path: PathPoint[];
  distance: number;
}

export interface RouteResult {
  legs: RouteLeg[];
  totalDistance: number;
}

export async function getRoute(
  start: { floorNo: number; x: number; y: number },
  stops: RouteStop[]
): Promise<RouteResult> {
  return apiFetch<RouteResult>("/api/navigation/route", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      startFloor: start.floorNo,
      startX: start.x,
      startY: start.y,
      stops,
    }),
  });
}
