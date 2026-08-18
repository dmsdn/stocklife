package com.storeflow.cart.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** /internal/cart 전용. 사용자 JWT가 없는 서버 간 호출이라 consumerId를 직접 받는다. */
public class InternalCartRequest {

    @NotNull(message = "consumerId는 필수입니다.")
    private Long consumerId;

    // add 용
    private Integer skuId;

    @Min(value = 1, message = "수량은 1개 이상이어야 합니다.")
    private Integer quantity;

    // update 용
    private Boolean checked;

    public Long getConsumerId() { return consumerId; }
    public void setConsumerId(Long consumerId) { this.consumerId = consumerId; }
    public Integer getSkuId() { return skuId; }
    public void setSkuId(Integer skuId) { this.skuId = skuId; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public Boolean getChecked() { return checked; }
    public void setChecked(Boolean checked) { this.checked = checked; }
}