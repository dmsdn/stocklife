package com.storeflow.product.dto;

import com.storeflow.product.entity.Product;

public class ProductSearchResponse {
    private Integer skuId;
    private String name;
    private String category;
    private String brand;
    private int priceKrw;
    private int stockQuantity;
    private boolean inStock;

    public ProductSearchResponse(Product product) {
        this.skuId = product.getSkuId();
        this.name = product.getName();
        this.category = product.getCategory();
        this.brand = product.getBrand();
        this.priceKrw = product.getPriceKrw();
        this.stockQuantity = product.getStockQuantity();
        this.inStock = product.getStockQuantity() > 0 && product.isActive();
    }

    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public String getCategory() { return category; }
    public String getBrand() { return brand; }
    public int getPriceKrw() { return priceKrw; }
    public int getStockQuantity() { return stockQuantity; }
    public boolean isInStock() { return inStock; }
}