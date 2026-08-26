package com.storeflow.inventory.dto;

import java.time.Instant;

/** 3단계 쿼리(최근 BELOW_PAR 이벤트) 결과 한 행. */
public class BelowParTimestamp {
    private final Integer skuId;
    private final String locationId;
    private final Instant occurredAt;

    public BelowParTimestamp(Integer skuId, String locationId, Instant occurredAt) {
        this.skuId = skuId;
        this.locationId = locationId;
        this.occurredAt = occurredAt;
    }

    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public Instant getOccurredAt() { return occurredAt; }
}
