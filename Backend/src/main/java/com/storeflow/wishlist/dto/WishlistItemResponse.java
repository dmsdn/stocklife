package com.storeflow.wishlist.dto;

import java.time.Instant;

public class WishlistItemResponse {
    private Integer skuId;
    private String name;
    private String brand;
    private int priceKrw;
    private String imageUrl;
    private Instant addedAt;

    public WishlistItemResponse(Integer skuId, String name, String brand, int priceKrw,
                                 String imageUrl, Instant addedAt) {
        this.skuId = skuId;
        this.name = name;
        this.brand = brand;
        this.priceKrw = priceKrw;
        this.imageUrl = imageUrl;
        this.addedAt = addedAt;
    }

    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public String getBrand() { return brand; }
    public int getPriceKrw() { return priceKrw; }
    public String getImageUrl() { return imageUrl; }
    public Instant getAddedAt() { return addedAt; }
}