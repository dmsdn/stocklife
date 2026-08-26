package com.storeflow.notification.dto;

/**
 * PATCH 요청이므로 필드를 보내지 않으면 기존 값 유지.
 */
public class UpdateNotificationSettingRequest {

    private Boolean allEnabled;
    private Boolean orderEnabled;
    private Boolean couponEnabled;
    private Boolean pointEnabled;
    private Boolean restockEnabled;
    private Boolean marketingEnabled;

    public Boolean getAllEnabled() {
        return allEnabled;
    }

    public void setAllEnabled(Boolean allEnabled) {
        this.allEnabled = allEnabled;
    }

    public Boolean getOrderEnabled() {
        return orderEnabled;
    }

    public void setOrderEnabled(Boolean orderEnabled) {
        this.orderEnabled = orderEnabled;
    }

    public Boolean getCouponEnabled() {
        return couponEnabled;
    }

    public void setCouponEnabled(Boolean couponEnabled) {
        this.couponEnabled = couponEnabled;
    }

    public Boolean getPointEnabled() {
        return pointEnabled;
    }

    public void setPointEnabled(Boolean pointEnabled) {
        this.pointEnabled = pointEnabled;
    }

    public Boolean getRestockEnabled() {
        return restockEnabled;
    }

    public void setRestockEnabled(Boolean restockEnabled) {
        this.restockEnabled = restockEnabled;
    }

    public Boolean getMarketingEnabled() {
        return marketingEnabled;
    }

    public void setMarketingEnabled(Boolean marketingEnabled) {
        this.marketingEnabled = marketingEnabled;
    }
}
