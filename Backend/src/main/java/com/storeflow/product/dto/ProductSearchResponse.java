package com.storeflow.product.dto;

import com.storeflow.product.entity.Product;

public class ProductSearchResponse {
    private Integer skuId;
    private String name;
    private String categoryL1;
    private String categoryL2;
    private String category;   // = category_l1
    private String categoryL2;
    private String brand;
    private int priceKrw;
    private String imageUrl;
    private boolean discontinued;
    private String unit;
    private String specRaw;
    private String imageUrl;
    private int stockQuantity;
    private boolean inStock;
    private String lifecycleStatus; // active -> "ACTIVE" / "DISCONTINUED" (컬럼 이중관리 피하려 파생시킴)

    public ProductSearchResponse(Product product) {
        this.skuId = product.getSkuId();
        this.name = product.getName();
        this.category = product.getCategory();
        this.categoryL2 = product.getCategoryL2();
        this.categoryL1 = product.getCategoryL1();
        this.categoryL2 = product.getCategoryL2();
        this.brand = product.getBrand();
        this.priceKrw = product.getPriceKrw();
        this.unit = product.getUnit();
        this.specRaw = product.getSpecRaw();
        this.imageUrl = product.getImageUrl();
        this.stockQuantity = product.getStockQuantity();
        this.inStock = product.getStockQuantity() > 0 && product.isActive();
        this.lifecycleStatus = product.isActive() ? "ACTIVE" : "DISCONTINUED";
        this.imageUrl = product.getImageUrl();
        this.discontinued = product.getLifecycleStatus() == Product.LifecycleStatus.DISCONTINUED;
    }

    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public String getCategory() { return category; }
    public String getCategoryL2() { return categoryL2; }
    public String getCategoryL1() { return categoryL1; }
    public String getCategoryL2() { return categoryL2; }
    public String getBrand() { return brand; }
    public int getPriceKrw() { return priceKrw; }
    public String getUnit() { return unit; }
    public String getSpecRaw() { return specRaw; }
    public String getImageUrl() { return imageUrl; }
    public int getStockQuantity() { return stockQuantity; }
    public boolean isInStock() { return inStock; }
    public String getLifecycleStatus() { return lifecycleStatus; }
    public String getImageUrl() { return imageUrl; }
    public boolean isDiscontinued() { return discontinued; }
}