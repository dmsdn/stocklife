package com.storeflow.cart.dto;

import com.storeflow.cart.entity.CartItem;

import java.time.LocalDateTime;

public class CartItemResponse {
    private Long cartItemId;
    private Integer skuId;
    private int quantity;
    private boolean checked;

    /** null 이면 아직 매장에서 스캔하지 않은 "계획" 항목이다(09-10 프론트 요청서). */
    private LocalDateTime scannedAt;

    public CartItemResponse(CartItem cartItem) {
        this.cartItemId = cartItem.getCartItemId();
        this.skuId = cartItem.getSkuId();
        this.quantity = cartItem.getQuantity();
        this.checked = cartItem.isChecked();
        this.scannedAt = cartItem.getScannedAt();
    }

    public Long getCartItemId() { return cartItemId; }
    public Integer getSkuId() { return skuId; }
    public int getQuantity() { return quantity; }
    public boolean isChecked() { return checked; }
    public LocalDateTime getScannedAt() { return scannedAt; }
}