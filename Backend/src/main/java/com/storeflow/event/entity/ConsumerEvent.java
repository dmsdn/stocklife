package com.storeflow.event.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * schema_v2.sql의 consumer_events 테이블 매핑.
 * 이 엔티티에 쓰는 경로는 InternalEventController 하나뿐이어야 한다 —
 * AI 서버(ai_search.py)가 더 이상 이 테이블에 직접 INSERT하지 않는다.
 */
@Entity
@Table(name = "consumer_events")
public class ConsumerEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventId;

    @Column(name = "event_type", nullable = false)
    private String eventType; // SCAN_ADD/SCAN_REMOVE/SEARCH/VIEW/LIST_EDIT/PURCHASE

    @Column(name = "session_id", nullable = false)
    private String sessionId;

    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "sku_id")
    private Integer skuId;

    @Column(name = "location_id")
    private String locationId;

    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    @Column(name = "payload", columnDefinition = "json")
    private String payloadJson;

    protected ConsumerEvent() {}

    public ConsumerEvent(String eventType, String sessionId, Long memberId, Integer skuId,
                         String locationId, LocalDateTime occurredAt, String payloadJson) {
        this.eventType = eventType;
        this.sessionId = sessionId;
        this.memberId = memberId;
        this.skuId = skuId;
        this.locationId = locationId;
        this.occurredAt = occurredAt;
        this.payloadJson = payloadJson;
    }

    public Long getEventId() { return eventId; }
    public String getEventType() { return eventType; }
    public String getSessionId() { return sessionId; }
    public Long getMemberId() { return memberId; }
    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public LocalDateTime getOccurredAt() { return occurredAt; }
    public String getPayloadJson() { return payloadJson; }
}