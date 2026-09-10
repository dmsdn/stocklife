package com.storeflow.cart.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public class AddCartItemRequest {

    @NotNull(message = "상품 ID는 필수입니다.")
    private Integer skuId;

    @Min(value = 1, message = "수량은 1개 이상이어야 합니다.")
    private int quantity = 1;

    /**
     * 바코드 스캔으로 담는 것인지(09-10 프론트 요청서).
     * true 면 scanned_at 을 지금 시각으로 채우고 수량은 **요청값과 무관하게 1**로 시작한다
     * (스캔은 언제나 한 개부터다). 안 보내거나 false 면 기존 동작 그대로.
     */
    private Boolean scanned;

    public Integer getSkuId() { return skuId; }
    public void setSkuId(Integer skuId) { this.skuId = skuId; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    public Boolean getScanned() { return scanned; }
    public void setScanned(Boolean scanned) { this.scanned = scanned; }
}