package com.storeflow.inventory.dto;

import java.time.Instant;

/** replenishment/pending(요청서 ③) 응답 한 행. */
public class PendingReplenishmentResponse {
    private final Integer skuId;
    private final String locationId;
    private final int floorNo;
    private final boolean hasBulk;
    private final Instant queuedAt; // BELOW_PAR 이벤트가 없으면 null — 0건이 아니라 "모름"

    public PendingReplenishmentResponse(Integer skuId, String locationId, int floorNo,
                                         boolean hasBulk, Instant queuedAt) {
        this.skuId = skuId;
        this.locationId = locationId;
        this.floorNo = floorNo;
        this.hasBulk = hasBulk;
        this.queuedAt = queuedAt;
    }

    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public int getFloorNo() { return floorNo; }
    public boolean isHasBulk() { return hasBulk; } // Jackson이 "hasBulk"로 직렬화함
    public Instant getQueuedAt() { return queuedAt; }
}
