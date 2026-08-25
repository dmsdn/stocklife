package com.storeflow.coupon.controller;

import com.storeflow.coupon.dto.CouponSummaryResponse;
import com.storeflow.coupon.service.CouponService;
import com.storeflow.global.security.CurrentConsumer;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/coupons")
public class CouponController {

    private final CouponService couponService;

    public CouponController(CouponService couponService) {
        this.couponService = couponService;
    }

    @GetMapping("/me")
    public ResponseEntity<CouponSummaryResponse> getMyCoupons(@CurrentConsumer Long consumerId) {
        return ResponseEntity.ok(couponService.getMyCoupons(consumerId));
    }
}
