package com.storeflow.point.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "point_history",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_point_history_order_type",
                columnNames = {"order_id", "type"}
        )
)
public class PointHistory {

    public enum Type {
        PURCHASE_EARN,
        REFUND_REVOKE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "point_history_id")
    private Long pointHistoryId;

    @Column(name = "consumer_id", nullable = false)
    private Long consumerId;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    /** 적립은 양수, 환불 회수는 음수로 저장한다. */
    @Column(name = "amount", nullable = false)
    private int amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 30)
    private Type type;

    @Column(name = "description", nullable = false, length = 100)
    private String description;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected PointHistory() {}

    public PointHistory(Long consumerId, Long orderId, int amount, Type type, String description) {
        this.consumerId = consumerId;
        this.orderId = orderId;
        this.amount = amount;
        this.type = type;
        this.description = description;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getPointHistoryId() { return pointHistoryId; }
    public Long getConsumerId() { return consumerId; }
    public Long getOrderId() { return orderId; }
    public int getAmount() { return amount; }
    public Type getType() { return type; }
    public String getDescription() { return description; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}