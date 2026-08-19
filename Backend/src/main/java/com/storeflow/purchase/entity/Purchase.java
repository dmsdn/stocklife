package com.storeflow.purchase.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "purchases")
public class Purchase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "purchase_id")
    private Long purchaseId;

    @Column(name = "basket_id", nullable = false)
    private String basketId;

    @Column(name = "member_id", nullable = false)
    private Integer memberId;

    @Column(name = "sku_id", nullable = false)
    private Integer skuId;

    @Column(name = "qty", nullable = false)
    private Integer qty;

    @Column(name = "unit_price_krw", nullable = false)
    private Integer unitPriceKrw;

    @Column(name = "purchased_at", nullable = false)
    private Instant purchasedAt;

    protected Purchase() {}

    public Purchase(String basketId, Integer memberId, Integer skuId,
                     Integer qty, Integer unitPriceKrw, Instant purchasedAt) {
        this.basketId = basketId;
        this.memberId = memberId;
        this.skuId = skuId;
        this.qty = qty;
        this.unitPriceKrw = unitPriceKrw;
        this.purchasedAt = purchasedAt;
    }

    public Long getPurchaseId() { return purchaseId; }
    public String getBasketId() { return basketId; }
    public Integer getMemberId() { return memberId; }
    public Integer getSkuId() { return skuId; }
    public Integer getQty() { return qty; }
    public Integer getUnitPriceKrw() { return unitPriceKrw; }
    public Instant getPurchasedAt() { return purchasedAt; }
}