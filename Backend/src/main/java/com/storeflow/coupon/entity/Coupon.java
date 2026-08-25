package com.storeflow.coupon.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "coupon")
public class Coupon {

    public enum DiscountType { FIXED, PERCENT }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "coupon_id")
    private Long couponId;

    @Column(name = "code", nullable = false, unique = true, length = 50)
    private String code;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "description", length = 255)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "discount_type", nullable = false, length = 20)
    private DiscountType discountType;

    @Column(name = "discount_value", nullable = false)
    private int discountValue;

    @Column(name = "min_order_amount", nullable = false)
    private int minOrderAmount;

    @Column(name = "max_discount_amount")
    private Integer maxDiscountAmount;

    @Column(name = "valid_from", nullable = false)
    private LocalDateTime validFrom;

    @Column(name = "valid_until", nullable = false)
    private LocalDateTime validUntil;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    protected Coupon() {}

    public int calculateDiscount(int originalAmount) {
        if (originalAmount < minOrderAmount) return 0;

        int discount;
        if (discountType == DiscountType.FIXED) {
            discount = discountValue;
        } else {
            discount = (int) Math.floor(originalAmount * (discountValue / 100.0));
            if (maxDiscountAmount != null) {
                discount = Math.min(discount, maxDiscountAmount);
            }
        }
        return Math.min(discount, originalAmount);
    }

    public boolean isUsableAt(LocalDateTime now) {
        return active && !now.isBefore(validFrom) && !now.isAfter(validUntil);
    }

    public Long getCouponId() { return couponId; }
    public String getCode() { return code; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public DiscountType getDiscountType() { return discountType; }
    public int getDiscountValue() { return discountValue; }
    public int getMinOrderAmount() { return minOrderAmount; }
    public Integer getMaxDiscountAmount() { return maxDiscountAmount; }
    public LocalDateTime getValidFrom() { return validFrom; }
    public LocalDateTime getValidUntil() { return validUntil; }
    public boolean isActive() { return active; }
}
