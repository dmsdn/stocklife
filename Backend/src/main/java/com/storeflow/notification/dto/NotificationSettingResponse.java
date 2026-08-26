package com.storeflow.notification.dto;

import com.storeflow.notification.entity.NotificationSetting;

import java.time.LocalDateTime;

public class NotificationSettingResponse {

    private final boolean allEnabled;
    private final boolean orderEnabled;
    private final boolean couponEnabled;
    private final boolean pointEnabled;
    private final boolean restockEnabled;
    private final boolean marketingEnabled;
    private final LocalDateTime updatedAt;

    public NotificationSettingResponse(NotificationSetting setting) {
        this.allEnabled = setting.isAllEnabled();
        this.orderEnabled = setting.isOrderEnabled();
        this.couponEnabled = setting.isCouponEnabled();
        this.pointEnabled = setting.isPointEnabled();
        this.restockEnabled = setting.isRestockEnabled();
        this.marketingEnabled = setting.isMarketingEnabled();
        this.updatedAt = setting.getUpdatedAt();
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

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}