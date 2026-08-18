package com.storeflow.product.dto;

import com.storeflow.product.entity.Product;

public class ProductSearchResponse {
    private Integer skuId;
    private String name;
    private String categoryL1;
    private String categoryL2;
    private String brand;
    private int priceKrw;
    private String imageUrl;
    private boolean discontinued;

    public ProductSearchResponse(Product product) {
        this.skuId = product.getSkuId();
        this.name = product.getName();
        this.categoryL1 = product.getCategoryL1();
        this.categoryL2 = product.getCategoryL2();
        this.brand = product.getBrand();
        this.priceKrw = product.getPriceKrw();
        this.imageUrl = product.getImageUrl();
        this.discontinued = product.getLifecycleStatus() == Product.LifecycleStatus.DISCONTINUED;
    }

    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public String getCategoryL1() { return categoryL1; }
    public String getCategoryL2() { return categoryL2; }
    public String getBrand() { return brand; }
    public int getPriceKrw() { return priceKrw; }
    public String getImageUrl() { return imageUrl; }
    public boolean isDiscontinued() { return discontinued; }
}