package com.storeflow.notification.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "notification_setting")
public class NotificationSetting {

    @Id
    @Column(name = "consumer_id", nullable = false)
    private Long consumerId;

    @Column(name = "all_enabled", nullable = false)
    private boolean allEnabled = true;

    @Column(name = "order_enabled", nullable = false)
    private boolean orderEnabled = true;

    @Column(name = "coupon_enabled", nullable = false)
    private boolean couponEnabled = true;

    @Column(name = "point_enabled", nullable = false)
    private boolean pointEnabled = true;

    @Column(name = "restock_enabled", nullable = false)
    private boolean restockEnabled = true;

    @Column(name = "marketing_enabled", nullable = false)
    private boolean marketingEnabled = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected NotificationSetting() {
    }

    public NotificationSetting(Long consumerId) {
        this.consumerId = consumerId;
    }

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void update(
            Boolean allEnabled,
            Boolean orderEnabled,
            Boolean couponEnabled,
            Boolean pointEnabled,
            Boolean restockEnabled,
            Boolean marketingEnabled
    ) {
        if (allEnabled != null) this.allEnabled = allEnabled;
        if (orderEnabled != null) this.orderEnabled = orderEnabled;
        if (couponEnabled != null) this.couponEnabled = couponEnabled;
        if (pointEnabled != null) this.pointEnabled = pointEnabled;
        if (restockEnabled != null) this.restockEnabled = restockEnabled;
        if (marketingEnabled != null) this.marketingEnabled = marketingEnabled;
    }

    public boolean isEnabledFor(String type) {
        if (!allEnabled) {
            return false;
        }

        if (type == null || type.isBlank()) {
            return true;
        }

        return switch (type.toUpperCase()) {
            case "ORDER", "ORDER_STATUS", "PURCHASE" -> orderEnabled;
            case "COUPON" -> couponEnabled;
            case "POINT" -> pointEnabled;
            case "RESTOCK", "STOCK" -> restockEnabled;
            case "MARKETING", "PROMOTION", "PROMO" -> marketingEnabled;
            default -> true;
        };
    }

    public Long getConsumerId() {
        return consumerId;
    }

    public boolean isAllEnabled() {
        return allEnabled;
    }

    public boolean isOrderEnabled() {
        return orderEnabled;
    }

    public boolean isCouponEnabled() {
        return couponEnabled;
    }

    public boolean isPointEnabled() {
        return pointEnabled;
    }

    public boolean isRestockEnabled() {
        return restockEnabled;
    }

    public boolean isMarketingEnabled() {
        return marketingEnabled;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}