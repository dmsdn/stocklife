package com.storeflow.inventory.dto;

import com.storeflow.inventory.entity.ShelfEvent;
import java.time.Instant;

public class ChangeEventResponse {
    private Long eventId;
    private ShelfEvent.EventType eventType;
    private Integer skuId;
    private String locationId;
    private Integer qty;
    private Instant occurredAt;
    private String payload;

    public ChangeEventResponse(ShelfEvent e) {
        this.eventId = e.getEventId();
        this.eventType = e.getEventType();
        this.skuId = e.getSkuId();
        this.locationId = e.getLocationId();
        this.qty = e.getQty();
        this.occurredAt = e.getOccurredAt();
        this.payload = e.getPayload();
    }

    public Long getEventId() { return eventId; }
    public ShelfEvent.EventType getEventType() { return eventType; }
    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public Integer getQty() { return qty; }
    public Instant getOccurredAt() { return occurredAt; }
    public String getPayload() { return payload; }
}