package com.storeflow.inventory.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "consumer_events")
public class ConsumerEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventId;

    // 6종 철자 = 계약(19번).
    public enum EventType {
        SCAN_ADD, SCAN_REMOVE, SEARCH, VIEW, LIST_EDIT, PURCHASE
    }

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false)
    private EventType eventType;

    // 비회원 포함 전원 필수(불변식 #9) — 로그인 여부와 무관하게 행동 추적은 계속 돼야 함
    @Column(name = "session_id", nullable = false)
    private String sessionId;

    // 로그인 세션이면 계산된 memberId, 아니면 null
    @Column(name = "member_id")
    private Integer memberId;

    @Column(name = "sku_id")
    private Integer skuId;

    // SCAN_ADD는 필수(위치 앵커의 원천) — 검증은 서비스 계층에서
    @Column(name = "location_id")
    private String locationId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "payload", columnDefinition = "json")
    private String payload;

    protected ConsumerEvent() {}

    public ConsumerEvent(EventType eventType, String sessionId, Integer memberId,
                          Integer skuId, String locationId, Instant occurredAt, String payload) {
        this.eventType = eventType;
        this.sessionId = sessionId;
        this.memberId = memberId;
        this.skuId = skuId;
        this.locationId = locationId;
        this.occurredAt = occurredAt;
        this.payload = payload;
    }

    public Long getEventId() { return eventId; }
    public EventType getEventType() { return eventType; }
    public String getSessionId() { return sessionId; }
    public Integer getMemberId() { return memberId; }
    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public Instant getOccurredAt() { return occurredAt; }
    public String getPayload() { return payload; }
}