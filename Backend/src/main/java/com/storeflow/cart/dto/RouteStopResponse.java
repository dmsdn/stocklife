package com.storeflow.cart.dto;

/**
 * 동선 안내의 정거장 하나 — "장바구니에 담긴 상품 하나를 어디서(locationId, x, y) 몇 번째로 담을지".
 * order는 0부터 시작하며, 시뮬레이션 프론트가 이 순서대로 A*(findPath)를 이어붙여
 * 화면에 선을 그린다(백엔드는 그리드/장애물을 모르므로 "방문 순서"만 정하고,
 * 실제 통행 가능 경로 계산은 프론트가 담당한다).
 */
public class RouteStopResponse {
    private final int order;
    private final Integer skuId;
    private final String productName;
    private final String locationId;
    private final int floorNo;
    private final int x;
    private final int y;

    public RouteStopResponse(int order, Integer skuId, String productName, String locationId,
                             int floorNo, int x, int y) {
        this.order = order;
        this.skuId = skuId;
        this.productName = productName;
        this.locationId = locationId;
        this.floorNo = floorNo;
        this.x = x;
        this.y = y;
    }

    public int getOrder() { return order; }
    public Integer getSkuId() { return skuId; }
    public String getProductName() { return productName; }
    public String getLocationId() { return locationId; }
    public int getFloorNo() { return floorNo; }
    public int getX() { return x; }
    public int getY() { return y; }
}