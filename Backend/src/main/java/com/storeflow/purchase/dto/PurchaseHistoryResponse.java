package com.storeflow.purchase.dto;

import java.time.Instant;

public class PurchaseHistoryResponse {
    private Long purchaseId;
    private Integer skuId;
    private String productName;
    private String imageUrl;
    private Integer qty;
    private Integer unitPriceKrw;
    private int subtotal;
    private Instant purchasedAt;

    public PurchaseHistoryResponse(Long purchaseId, Integer skuId, String productName, String imageUrl,
                                    Integer qty, Integer unitPriceKrw, Instant purchasedAt) {
        this.purchaseId = purchaseId;
        this.skuId = skuId;
        this.productName = productName;
        this.imageUrl = imageUrl;
        this.qty = qty;
        this.unitPriceKrw = unitPriceKrw;
        this.subtotal = qty * unitPriceKrw;
        this.purchasedAt = purchasedAt;
    }

    public Long getPurchaseId() { return purchaseId; }
    public Integer getSkuId() { return skuId; }
    public String getProductName() { return productName; }
    public String getImageUrl() { return imageUrl; }
    public Integer getQty() { return qty; }
    public Integer getUnitPriceKrw() { return unitPriceKrw; }
    public int getSubtotal() { return subtotal; }
    public Instant getPurchasedAt() { return purchasedAt; }
}