package com.storeflow.cart.dto;

import com.storeflow.cart.entity.CartGroup;
import java.util.List;

public class CartGroupResponse {
    private final Long cartGroupId;
    private final String title;
    private final String description;
    private final String shoppingDate; // yyyy-MM-dd, 없으면 null
    private final int itemCount;       // 리스트 박스 표시용 — 담긴 상품 개수(items.size())
    private final String createdAt;
    private final String updatedAt;    // 리스트 박스에 "n일 전 수정" 등 표시할 때 사용
    private final List<CartItemResponse> items;
    private final String status; // ACTIVE | COMPLETED

    public CartGroupResponse(CartGroup group, List<CartItemResponse> items) {
        this.cartGroupId = group.getCartGroupId();
        this.title = group.getTitle();
        this.description = group.getDescription();
        this.shoppingDate = group.getShoppingDate() == null ? null : group.getShoppingDate().toString();
        this.itemCount = items == null ? 0 : items.size();
        this.createdAt = group.getCreatedAt() == null ? null : group.getCreatedAt().toString();
        this.updatedAt = group.getUpdatedAt() == null ? null : group.getUpdatedAt().toString();
        this.items = items;
        this.status = group.getStatus().name();
    }

    public Long getCartGroupId() { return cartGroupId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getShoppingDate() { return shoppingDate; }
    public int getItemCount() { return itemCount; }
    public String getCreatedAt() { return createdAt; }
    public String getUpdatedAt() { return updatedAt; }
    public List<CartItemResponse> getItems() { return items; }
    public String getStatus() { return status; }
}