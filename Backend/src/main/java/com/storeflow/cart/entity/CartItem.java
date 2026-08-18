package com.storeflow.cart.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "cart_item")
public class CartItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "cart_item_id")
    private Long cartItemId;

    @Column(name = "consumer_id", nullable = false)
    private Long consumerId;

    @Column(name = "sku_id", nullable = false)
    private Integer skuId;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "is_checked", nullable = false)
    private boolean checked;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected CartItem() {}

    public CartItem(Long consumerId, Integer skuId, int quantity) {
        this.consumerId = consumerId;
        this.skuId = skuId;
        this.quantity = quantity;
        this.checked = true; // 기본값: 담으면 체크된 상태로 시작
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public void increaseQuantity(int amount) {
        this.quantity += amount;
    }

    public void changeQuantity(int quantity) {
        if (quantity < 1) {
            throw new IllegalArgumentException("수량은 1개 이상이어야 합니다.");
        }
        this.quantity = quantity;
    }

    public void toggleChecked(boolean checked) {
        this.checked = checked;
    }

    // getters
    public Long getCartItemId() { return cartItemId; }
    public Long getConsumerId() { return consumerId; }
    public Integer getSkuId() { return skuId; }
    public int getQuantity() { return quantity; }
    public boolean isChecked() { return checked; }
}