package com.storeflow.inventory.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "shelf_events")
public class ShelfEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventId;

    // 8종 철자 = 계약(17번). 여기 말고 다른 데서 문자열로 다시 만들지 말 것.
    public enum EventType {
        SALE, BELOW_PAR, TASK_QUEUED, TASK_STARTED,
        ITEM_CONFIRMED, STOCKOUT, RESTOCK_IN, MOVE
    }

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false)
    private EventType eventType;

    @Column(name = "sku_id", nullable = false)
    private Integer skuId;

    @Column(name = "location_id", nullable = false)
    private String locationId;

    @Column(name = "qty")
    private Integer qty;

    @Column(name = "task_id")
    private String taskId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "payload", columnDefinition = "json")
    private String payload;

    protected ShelfEvent() {}

    public ShelfEvent(EventType eventType, Integer skuId, String locationId, Integer qty,
                       String taskId, Instant occurredAt, String payload) {
        this.eventType = eventType;
        this.skuId = skuId;
        this.locationId = locationId;
        this.qty = qty;
        this.taskId = taskId;
        this.occurredAt = occurredAt;
        this.payload = payload;
    }

    public Long getEventId() { return eventId; }
    public EventType getEventType() { return eventType; }
    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public Integer getQty() { return qty; }
    public String getTaskId() { return taskId; }
    public Instant getOccurredAt() { return occurredAt; }
    public String getPayload() { return payload; }
}