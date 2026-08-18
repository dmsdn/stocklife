package com.storeflow.promotion.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "promotions")
public class Promotion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "promo_id")
    private Long promoId;

    @Column(name = "sku_id", nullable = false)
    private Integer skuId;

    @Column(name = "promo_type", nullable = false)
    private String promoType;

    @Column(name = "discount_krw", nullable = false)
    private int discountKrw;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    protected Promotion() {}

    public Long getPromoId() { return promoId; }
    public Integer getSkuId() { return skuId; }
    public String getPromoType() { return promoType; }
    public int getDiscountKrw() { return discountKrw; }
    public Instant getStartsAt() { return startsAt; }
    public Instant getEndsAt() { return endsAt; }
}