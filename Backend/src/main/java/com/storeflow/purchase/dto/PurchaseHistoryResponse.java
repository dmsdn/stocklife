package com.storeflow.purchase.dto;

import java.time.Instant;

public class PurchaseHistoryResponse {
    private Long purchaseId;
    private Integer skuId;
    private String productName;
    private String imageUrl;
    private String categoryL1;
    private String categoryL2;
    private Integer qty;
    private Integer unitPriceKrw;
    private int subtotal;
    private Instant purchasedAt;

    public PurchaseHistoryResponse(Long purchaseId, Integer skuId, String productName, String imageUrl,
                                   String categoryL1, String categoryL2,
                                   Integer qty, Integer unitPriceKrw, Instant purchasedAt) {
        this.purchaseId = purchaseId;
        this.skuId = skuId;
        this.productName = productName;
        this.imageUrl = imageUrl;
        this.categoryL1 = categoryL1;
        this.categoryL2 = categoryL2;
        this.qty = qty;
        this.unitPriceKrw = unitPriceKrw;
        this.subtotal = qty * unitPriceKrw;
        this.purchasedAt = purchasedAt;
    }

    public Long getPurchaseId() { return purchaseId; }
    public Integer getSkuId() { return skuId; }
    public String getProductName() { return productName; }
    public String getImageUrl() { return imageUrl; }
    public String getCategoryL1() { return categoryL1; }
    public String getCategoryL2() { return categoryL2; }
    public Integer getQty() { return qty; }
    public Integer getUnitPriceKrw() { return unitPriceKrw; }
    public int getSubtotal() { return subtotal; }
    public Instant getPurchasedAt() { return purchasedAt; }
}