package com.storeflow.cart.dto;

import com.storeflow.cart.entity.CartGroup;
import java.util.List;

public class CartGroupResponse {
    private final Long cartGroupId;
    private final String title;
    private final String description;
    private final String createdAt;
    private final List<CartItemResponse> items;

    public CartGroupResponse(CartGroup group, List<CartItemResponse> items) {
        this.cartGroupId = group.getCartGroupId();
        this.title = group.getTitle();
        this.description = group.getDescription();
        this.createdAt = group.getCreatedAt() == null ? null : group.getCreatedAt().toString();
        this.items = items;
    }

    public Long getCartGroupId() { return cartGroupId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getCreatedAt() { return createdAt; }
    public List<CartItemResponse> getItems() { return items; }
}
