package com.storeflow.point.dto;

import com.storeflow.point.entity.PointTransaction;

import java.time.LocalDateTime;

public class PointTransactionResponse {

    private final Long pointTransactionId;
    private final Long orderId;

    private final String type;

    private final int amount;
    private final int balanceAfter;

    private final String description;

    private final LocalDateTime createdAt;

    public PointTransactionResponse(
            PointTransaction transaction
    ) {
        this.pointTransactionId =
                transaction.getPointTransactionId();

        this.orderId =
                transaction.getOrderId();

        this.type =
                transaction.getTransactionType().name();

        this.amount =
                transaction.getAmount();

        this.balanceAfter =
                transaction.getBalanceAfter();

        this.description =
                transaction.getDescription();

        this.createdAt =
                transaction.getCreatedAt();
    }

    public Long getPointTransactionId() {
        return pointTransactionId;
    }

    public Long getOrderId() {
        return orderId;
    }

    public String getType() {
        return type;
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