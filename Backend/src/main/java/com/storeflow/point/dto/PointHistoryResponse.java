package com.storeflow.point.dto;

import com.storeflow.point.entity.PointHistory;

import java.time.LocalDateTime;

public class PointHistoryResponse {
    private final Long pointHistoryId;
    private final Long orderId;
    private final int amount;
    private final String type;
    private final String description;
    private final LocalDateTime createdAt;

    public PointHistoryResponse(PointHistory history) {
        this.pointHistoryId = history.getPointHistoryId();
        this.orderId = history.getOrderId();
        this.amount = history.getAmount();
        this.type = history.getType().name();
        this.description = history.getDescription();
        this.createdAt = history.getCreatedAt();
    }

    public Long getPointHistoryId() { return pointHistoryId; }
    public Long getOrderId() { return orderId; }
    public int getAmount() { return amount; }
    public String getType() { return type; }
    public String getDescription() { return description; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}