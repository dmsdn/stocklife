package com.storeflow.coupon.dto;

import com.storeflow.coupon.entity.ConsumerCoupon;
import com.storeflow.coupon.entity.Coupon;

import java.time.LocalDateTime;

public class CouponResponse {
    private final Long consumerCouponId;
    private final String code;
    private final String title;
    private final String description;
    private final String discountType;
    private final int discountValue;
    private final int minOrderAmount;
    private final Integer maxDiscountAmount;
    private final String status;
    private final boolean usable;
    private final LocalDateTime validUntil;

    public CouponResponse(ConsumerCoupon consumerCoupon) {
        Coupon coupon = consumerCoupon.getCoupon();
        this.consumerCouponId = consumerCoupon.getConsumerCouponId();
        this.code = coupon.getCode();
        this.title = coupon.getTitle();
        this.description = coupon.getDescription();
        this.discountType = coupon.getDiscountType().name();
        this.discountValue = coupon.getDiscountValue();
        this.minOrderAmount = coupon.getMinOrderAmount();
        this.maxDiscountAmount = coupon.getMaxDiscountAmount();
        this.status = consumerCoupon.getStatus().name();
        this.usable = consumerCoupon.getStatus() == ConsumerCoupon.Status.AVAILABLE
                && coupon.isUsableAt(LocalDateTime.now());
        this.validUntil = coupon.getValidUntil();
    }

    public Long getConsumerCouponId() { return consumerCouponId; }
    public String getCode() { return code; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getDiscountType() { return discountType; }
    public int getDiscountValue() { return discountValue; }
    public int getMinOrderAmount() { return minOrderAmount; }
    public Integer getMaxDiscountAmount() { return maxDiscountAmount; }
    public String getStatus() { return status; }
    public boolean isUsable() { return usable; }
    public LocalDateTime getValidUntil() { return validUntil; }
}
