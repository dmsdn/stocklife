package com.storeflow.point.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "point_transaction")
public class PointTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "point_transaction_id")
    private Long pointTransactionId;

    @Column(name = "consumer_id", nullable = false)
    private Long consumerId;

    @Column(name = "order_id")
    private Long orderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "transaction_type", nullable = false, length = 30)
    private PointTransactionType transactionType;

    /**
     * 적립/복구는 양수
     * 사용/적립취소는 음수
     *
     * 예:
     * +100 = 100P 적립
     * -3000 = 3000P 사용
     */
    @Column(name = "amount", nullable = false)
    private int amount;

    @Column(name = "balance_after", nullable = false)
    private int balanceAfter;

    @Column(name = "description", length = 255)
    private String description;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected PointTransaction() {
    }

    public PointTransaction(
            Long consumerId,
            Long orderId,
            PointTransactionType transactionType,
            int amount,
            int balanceAfter,
            String description
    ) {
        this.consumerId = consumerId;
        this.orderId = orderId;
        this.transactionType = transactionType;
        this.amount = amount;
        this.balanceAfter = balanceAfter;
        this.description = description;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getPointTransactionId() {
        return pointTransactionId;
    }

    public Long getConsumerId() {
        return consumerId;
    }

    public Long getOrderId() {
        return orderId;
    }

    public PointTransactionType getTransactionType() {
        return transactionType;
    }

    public int getAmount() {
        return amount;
    }

    public int getBalanceAfter() {
        return balanceAfter;
    }

    public String getDescription() {
        return description;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}