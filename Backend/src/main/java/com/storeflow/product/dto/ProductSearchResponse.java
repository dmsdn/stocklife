package com.storeflow.product.dto;

import com.storeflow.product.entity.Product;

/**
 * 상품 검색 공용 응답 DTO.
 * category는 기존 ai-server 호환용 alias이고 categoryL1과 같은 값이다.
 */
public class ProductSearchResponse {
    private Integer skuId;
    private String name;
    private String category;
    private String categoryL1;
    private String categoryL2;
    private String brand;
    private int priceKrw;
    private String unit;
    private String specRaw;
    private String imageUrl;
    private String lifecycleStatus;
    private boolean discontinued;

    public ProductSearchResponse(Product product) {
        this.skuId = product.getSkuId();
        this.name = product.getName();
        this.category = product.getCategoryL1();
        this.categoryL1 = product.getCategoryL1();
        this.categoryL2 = product.getCategoryL2();
        this.brand = product.getBrand();
        this.priceKrw = product.getPriceKrw();
        this.unit = product.getUnit();
        this.specRaw = product.getSpecRaw();
        this.imageUrl = product.getImageUrl();
        this.lifecycleStatus = product.getLifecycleStatus().name();
        this.discontinued = product.getLifecycleStatus() == Product.LifecycleStatus.DISCONTINUED;
    }

    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public String getCategory() { return category; }
    public String getCategoryL1() { return categoryL1; }
    public String getCategoryL2() { return categoryL2; }
    public String getBrand() { return brand; }
    public int getPriceKrw() { return priceKrw; }
    public String getUnit() { return unit; }
    public String getSpecRaw() { return specRaw; }
    public String getImageUrl() { return imageUrl; }
    public String getLifecycleStatus() { return lifecycleStatus; }
    public boolean isDiscontinued() { return discontinued; }
}
