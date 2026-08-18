package com.storeflow.cart.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public class AddCartItemRequest {

    @NotNull(message = "상품 ID는 필수입니다.")
    private Integer skuId;

    @Min(value = 1, message = "수량은 1개 이상이어야 합니다.")
    private int quantity = 1;

    public Integer getSkuId() { return skuId; }
    public void setSkuId(Integer skuId) { this.skuId = skuId; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
}