package com.storeflow.product.dto;

import com.storeflow.product.entity.Product;

public class ProductDetailResponse {
    private Integer skuId;
    private String name;
    private String brand;
    private String categoryL1;
    private String categoryL2;
    private int priceKrw;
    private String unit;
    private String specRaw;   // 규격 원문 (예: "9,000ml (1.5L × 6입)")
    private String spec;      // 규격 JSON 원문
    private String imageUrl;
    private boolean discontinued; // true면 단종 — "그 커피 어디 갔어요?" 같은 질문에 응답용

    public ProductDetailResponse(Product product) {
        this.skuId = product.getSkuId();
        this.name = product.getName();
        this.brand = product.getBrand();
        this.categoryL1 = product.getCategoryL1();
        this.categoryL2 = product.getCategoryL2();
        this.priceKrw = product.getPriceKrw();
        this.unit = product.getUnit();
        this.specRaw = product.getSpecRaw();
        this.spec = product.getSpec();
        this.imageUrl = product.getImageUrl();
        this.discontinued = product.getLifecycleStatus() == Product.LifecycleStatus.DISCONTINUED;
    }

    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public String getBrand() { return brand; }
    public String getCategoryL1() { return categoryL1; }
    public String getCategoryL2() { return categoryL2; }
    public int getPriceKrw() { return priceKrw; }
    public String getUnit() { return unit; }
    public String getSpecRaw() { return specRaw; }
    public String getSpec() { return spec; }
    public String getImageUrl() { return imageUrl; }
    public boolean isDiscontinued() { return discontinued; }
}