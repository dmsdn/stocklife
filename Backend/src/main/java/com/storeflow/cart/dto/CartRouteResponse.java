package com.storeflow.cart.dto;

import java.util.List;

/**
 * GET /api/cart/groups/{groupId}/route 응답.
 * stops는 이미 최적 방문 순서로 정렬되어 있다(0번이 출발 후 첫 목적지).
 * totalDistanceCells는 맨해튼 거리 합(장애물 미고려 근사치) — 실제 화면 경로 길이는
 * 프론트의 A* 결과가 정확하며, 이 값은 "대략 이 정도 순서가 최선"이라는 참고용이다.
 */
public class CartRouteResponse {
    private final List<RouteStopResponse> stops;
    private final int totalDistanceCells;
    private final boolean multiFloor; // true면 층 이동(에스컬레이터/엘리베이터)이 동선에 포함됨

    public CartRouteResponse(List<RouteStopResponse> stops, int totalDistanceCells, boolean multiFloor) {
        this.stops = stops;
        this.totalDistanceCells = totalDistanceCells;
        this.multiFloor = multiFloor;
    }

    public List<RouteStopResponse> getStops() { return stops; }
    public int getTotalDistanceCells() { return totalDistanceCells; }
    public boolean isMultiFloor() { return multiFloor; }
}