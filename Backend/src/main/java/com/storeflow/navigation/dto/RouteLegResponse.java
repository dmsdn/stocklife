package com.storeflow.navigation.dto;

import com.storeflow.navigation.model.GridKey;

import java.util.List;

public class RouteLegResponse {

    public enum Status {
        OK,            // 경로 계산 성공
        UNRESOLVED,    // skuId/locationId로 위치 자체를 못 찾음 (재고 없음, 잘못된 ID 등)
        UNREACHABLE    // 위치는 찾았지만 장애물에 막혀 갈 수 있는 경로가 없음
    }

    private int stopIndex;
    private String label;
    private Integer skuId;
    private String locationId;
    private String zoneId;
    private Status status;
    private List<PathPointResponse> path;
    private int distance; // 칸 수(무빙워크 구간은 가중치 반영된 비용)

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
        return leg;
    }

    public int getStopIndex() { return stopIndex; }
    public String getLabel() { return label; }
    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public String getZoneId() { return zoneId; }
    public Status getStatus() { return status; }
    public List<PathPointResponse> getPath() { return path; }
    public int getDistance() { return distance; }
}