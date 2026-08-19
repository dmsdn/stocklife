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

    public Integer getSkuId() { return skuId; }
    public void setSkuId(Integer skuId) { this.skuId = skuId; }
    public String getLocationId() { return locationId; }
    public void setLocationId(String locationId) { this.locationId = locationId; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
}