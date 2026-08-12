package com.storeflow.order.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "order_item")
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "order_item_id")
    private Long orderItemId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @Column(name = "sku_id", nullable = false)
    private Integer skuId;

    @Column(name = "product_name", nullable = false)
    private String productName;

    @Column(name = "price_krw", nullable = false)
    private int priceKrw;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    protected OrderItem() {}

    public OrderItem(Integer skuId, String productName, int priceKrw, int quantity) {
        this.skuId = skuId;
        this.productName = productName;
        this.priceKrw = priceKrw;
        this.quantity = quantity;
    }

    public void assignOrder(Order order) {
        this.order = order;
    }

    public Integer getSkuId() { return skuId; }
    public String getProductName() { return productName; }
    public int getPriceKrw() { return priceKrw; }
    public int getQuantity() { return quantity; }
}