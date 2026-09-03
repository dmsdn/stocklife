package com.storeflow.navigation.dto;

/**
 * skuId를 주면 백엔드가 해당 상품의 재고가 있는 매대 위치를 자동으로 찾는다
 * (get_inventory와 같은 로직 재사용 — PICK 재고 우선).
 * locationId를 직접 주면 그 좌표로 바로 안내한다 (예: "전자제품 코너" 같은
 * 존 단위 안내처럼 AI가 특정 위치 코드를 이미 알고 있는 경우).
 * label은 화면 표시용(예: "화장품") — 응답에 그대로 echo된다.
 */
public class RouteStopRequest {

    private Integer skuId;
    private String locationId;
    private String label;
    // 09-03: 시설(화장실·계산대…)은 location_id 가 없다 — 격자 좌표로 직접 목적지를 준다.
    //   skuId/locationId 가 없을 때만 본다. 세 칸이 다 있어야 유효.
    private Integer floorNo;
    private Integer x;
    private Integer y;

    public Integer getSkuId() { return skuId; }
    public void setSkuId(Integer skuId) { this.skuId = skuId; }
    public String getLocationId() { return locationId; }
    public void setLocationId(String locationId) { this.locationId = locationId; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public Integer getFloorNo() { return floorNo; }
    public Integer getX() { return x; }
    public Integer getY() { return y; }
}
