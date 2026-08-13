package com.storeflow.product.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "products")
public class Product {

    @Id
    @Column(name = "sku_id")
    private Integer skuId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "price_krw", nullable = false)
    private int priceKrw;

    @Column(name = "stock_quantity", nullable = false)
    private int stockQuantity;

    @Column(name = "active")
    private boolean active;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "brand")
    private String brand;

    protected Product() {}

    public void decreaseStock(int quantity) {
        if (this.stockQuantity < quantity) {
            throw new IllegalStateException("[" + name + "] 재고가 부족합니다. (남은 수량: " + stockQuantity + ")");
        }
        this.stockQuantity -= quantity;
    }

    public String getCategory() { return category; }
    public String getBrand() { return brand; }
    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public int getPriceKrw() { return priceKrw; }
    public int getStockQuantity() { return stockQuantity; }
    public boolean isActive() { return active; }
}