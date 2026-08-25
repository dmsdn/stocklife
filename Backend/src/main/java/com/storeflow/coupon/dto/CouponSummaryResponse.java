package com.storeflow.coupon.dto;

import java.util.List;

public class CouponSummaryResponse {
    private final long availableCount;
    private final List<CouponResponse> coupons;

    public CouponSummaryResponse(List<CouponResponse> coupons) {
        this.coupons = coupons;
        this.availableCount = coupons.stream().filter(CouponResponse::isUsable).count();
    }

    public long getAvailableCount() { return availableCount; }
    public List<CouponResponse> getCoupons() { return coupons; }
}
