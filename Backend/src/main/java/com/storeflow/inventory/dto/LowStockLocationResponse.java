package com.storeflow.inventory.dto;

import java.util.List;

/**
 * GET /api/floors/{floorNo}/low-stock-locations(신규) 응답 한 매대 — 재고 부족(minQty 미만)
 * 상품이 하나 이상 있는 매대와, 그 매대에서 부족한 skuId 전부. NPC 재입고 스캔이 매대마다
 * /api/locations/{id}/products를 하나씩 순차로 부르던 걸 없애고, 층 전체를 서버에서 쿼리
 * 한 번으로 끝내기 위한 전용 엔드포인트.
 */
public class LowStockLocationResponse {
    private final String locationId;
    private final List<Integer> skuIds;

    public LowStockLocationResponse(String locationId, List<Integer> skuIds) {
        this.locationId = locationId;
        this.skuIds = skuIds;
    }

    public String getLocationId() { return locationId; }
    public List<Integer> getSkuIds() { return skuIds; }
}
