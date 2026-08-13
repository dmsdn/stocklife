package com.storeflow.cart.dto;

import com.storeflow.cart.entity.CartItem;

public class CartItemResponse {
    private Long cartItemId;
    private Integer skuId;
    private int quantity;
    private boolean checked;

    public CartItemResponse(CartItem cartItem) {
        this.cartItemId = cartItem.getCartItemId();
        this.skuId = cartItem.getSkuId();
        this.quantity = cartItem.getQuantity();
        this.checked = cartItem.isChecked();
    }

    public Long getCartItemId() { return cartItemId; }
    public Integer getSkuId() { return skuId; }
    public int getQuantity() { return quantity; }
    public boolean isChecked() { return checked; }
}