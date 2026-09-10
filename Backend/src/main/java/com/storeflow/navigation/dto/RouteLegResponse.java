package com.storeflow.navigation.dto;

import com.storeflow.navigation.model.GridKey;

import java.util.List;

public class RouteLegResponse {

    public enum Status {
        OK,            // 경로 계산 성공
        UNRESOLVED,    // skuId/locationId로 위치 자체를 못 찾음 (재고 없음, 잘못된 ID 등)
        UNREACHABLE    // 위치는 찾았지만 장애물에 막혀 갈 수 있는 경로가 없음
    }

    /**
     * 층을 오갈 때의 방향(09-10).
     *
     * [왜 데이터가 아니라 경로에서 뽑나] 세계 데이터에는 상행/하행 구분이 없다.
     * map_cells.transit_id 는 "ESC" 하나뿐이고, 같은 칸으로 올라가고 내려간다.
     * 그런데 방향은 원래 시설의 속성이 아니라 **이 손님이 지금 어디로 가느냐**의
     * 속성이다. 1층에서 2층으로 가는 사람에게 하행을 안내할 일은 없다. 그래서
     * 시드를 바꿔 데이터에 박아두는 대신, 이미 계산된 경로에서 읽어낸다 —
     * 세계 데이터를 건드리지 않으므로 상품 위치나 재고가 흔들릴 일이 없다.
     */
    public enum TransitDirection { UP, DOWN }

    /** 경로 중 층이 바뀌는 지점 하나. 프론트가 "올라가는 에스컬레이터로" 같은 안내를 만들 때 쓴다. */
    public static class FloorTransition {
        private int fromFloor;
        private int toFloor;
        private TransitDirection direction;
        private int x;
        private int y;

        FloorTransition(int fromFloor, int toFloor, int x, int y) {
            this.fromFloor = fromFloor;
            this.toFloor = toFloor;
            this.direction = toFloor > fromFloor ? TransitDirection.UP : TransitDirection.DOWN;
            this.x = x;
            this.y = y;
        }

        public int getFromFloor() { return fromFloor; }
        public int getToFloor() { return toFloor; }
        public TransitDirection getDirection() { return direction; }
        public int getX() { return x; }
        public int getY() { return y; }
    }

    private int stopIndex;
    private String label;
    private Integer skuId;
    private String locationId;
    private String zoneId;
    private Status status;
    private List<PathPointResponse> path;
    private int distance; // 칸 수(무빙워크 구간은 가중치 반영된 비용)

    /**
     * 이 구간에서 층이 바뀌는 지점들. 같은 층 안에서만 움직이면 빈 목록이다.
     * 한 구간에 여러 개가 들어갈 수 있다 — 1층에서 3층으로 갈 때 2층을 거치면 두 개다.
     */
    private List<FloorTransition> floorTransitions = List.of();

    public static RouteLegResponse unresolved(int stopIndex, RouteStopRequest stop) {
        RouteLegResponse leg = new RouteLegResponse();
        leg.stopIndex = stopIndex;
        leg.label = stop.getLabel();
        leg.skuId = stop.getSkuId();
        leg.locationId = stop.getLocationId();
        leg.status = Status.UNRESOLVED;
        leg.path = List.of();
        leg.distance = 0;
        return leg;
    }

    public static RouteLegResponse unreachable(int stopIndex, String label, Integer skuId,
                                               String locationId, String zoneId) {
        RouteLegResponse leg = new RouteLegResponse();
        leg.stopIndex = stopIndex;
        leg.label = label;
        leg.skuId = skuId;
        leg.locationId = locationId;
        leg.zoneId = zoneId;
        leg.status = Status.UNREACHABLE;
        leg.path = List.of();
        leg.distance = 0;
        return leg;
    }

    public static RouteLegResponse ok(int stopIndex, String label, Integer skuId, String locationId,
                                      String zoneId, List<GridKey> path, int distance) {
        RouteLegResponse leg = new RouteLegResponse();
        leg.stopIndex = stopIndex;
        leg.label = label;
        leg.skuId = skuId;
        leg.locationId = locationId;
        leg.zoneId = zoneId;
        leg.status = Status.OK;
        leg.path = path.stream().map(PathPointResponse::new).toList();
        leg.distance = distance;
        leg.floorTransitions = extractFloorTransitions(path);
        return leg;
    }

    /**
     * 경로에서 층이 바뀌는 순간을 집어낸다.
     *
     * 층 이동은 같은 x, y 에서 floorNo 만 달라지는 한 걸음으로 나타난다(NavigationGraph 가
     * 같은 transit_id 칸끼리 간선을 놓기 때문). 그래서 앞뒤 점의 층만 비교하면 된다.
     * 좌표는 **타는 자리**를 준다 — 프론트가 "저기서 올라가세요"라고 짚어줄 수 있게.
     */
    private static List<FloorTransition> extractFloorTransitions(List<GridKey> path) {
        if (path == null || path.size() < 2) {
            return List.of();
        }

        List<FloorTransition> transitions = new java.util.ArrayList<>();
        for (int i = 1; i < path.size(); i++) {
            GridKey before = path.get(i - 1);
            GridKey after = path.get(i);
            if (before.floorNo() != after.floorNo()) {
                transitions.add(new FloorTransition(
                        before.floorNo(), after.floorNo(), before.x(), before.y()));
            }
        }
        return List.copyOf(transitions);
    }

    public int getStopIndex() { return stopIndex; }
    public String getLabel() { return label; }
    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public String getZoneId() { return zoneId; }
    public Status getStatus() { return status; }
    public List<PathPointResponse> getPath() { return path; }
    public int getDistance() { return distance; }
    public List<FloorTransition> getFloorTransitions() { return floorTransitions; }
}