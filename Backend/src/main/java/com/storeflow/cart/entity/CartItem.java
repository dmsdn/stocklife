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

    @Column(name = "cart_group_id", nullable = false)
    private Long cartGroupId;

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

    public CartItem(Long cartGroupId, Integer skuId, int quantity) {
        this(cartGroupId, skuId, quantity, true);
    }

    public CartItem(Long cartGroupId, Integer skuId, int quantity, boolean checked) {
        if (cartGroupId == null) throw new IllegalArgumentException("cartGroupId는 필수입니다.");
        this.cartGroupId = cartGroupId;
        this.skuId = skuId;
        this.quantity = quantity;
        this.checked = checked;
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() { updatedAt = LocalDateTime.now(); }

    public void increaseQuantity(int amount) { quantity += amount; }
    public void changeQuantity(int quantity) {
        if (quantity < 1) throw new IllegalArgumentException("수량은 1개 이상이어야 합니다.");
        this.quantity = quantity;
    }
    public void toggleChecked(boolean checked) { this.checked = checked; }

    public Long getCartItemId() { return cartItemId; }
    public Long getCartGroupId() { return cartGroupId; }
    public Integer getSkuId() { return skuId; }
    public int getQuantity() { return quantity; }
    public boolean isChecked() { return checked; }
}
