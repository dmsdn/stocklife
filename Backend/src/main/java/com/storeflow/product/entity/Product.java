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

    protected Product() {}

    public void decreaseStock(int quantity) {
        if (this.stockQuantity < quantity) {
            throw new IllegalStateException("[" + name + "] 재고가 부족합니다. (남은 수량: " + stockQuantity + ")");
        }
        this.stockQuantity -= quantity;
    }

    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public int getPriceKrw() { return priceKrw; }
    public int getStockQuantity() { return stockQuantity; }
    public boolean isActive() { return active; }
}