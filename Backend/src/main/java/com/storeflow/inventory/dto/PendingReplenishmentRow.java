package com.storeflow.inventory.dto;

/** 1단계 쿼리(par 밑 PICK 매대) 결과 한 행 — 아직 hasBulk/queuedAt은 안 채워짐. */
public class PendingReplenishmentRow {
    private final Integer skuId;
    private final String locationId;
    private final int floorNo;

    public PendingReplenishmentRow(Integer skuId, String locationId, byte floorNo) {
        this.skuId = skuId;
        this.locationId = locationId;
        this.floorNo = floorNo;
    }

    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public int getFloorNo() { return floorNo; }
}
