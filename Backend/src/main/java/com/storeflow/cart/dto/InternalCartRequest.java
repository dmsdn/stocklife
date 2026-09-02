package com.storeflow.cart.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** /internal/cart 전용. 사용자 JWT가 없는 서버 간 호출이라 consumerId를 직접 받는다. */
public class InternalCartRequest {

    @NotNull(message = "consumerId는 필수입니다.")
    private Long consumerId;

    // add 용
    private Integer skuId;

    // add 용(선택) — 지정하면 그 리스트(cart_group)에 담고, 없으면 기존처럼 "기본 장바구니"에 담긴다.
    private Long groupId;

    @Min(value = 1, message = "수량은 1개 이상이어야 합니다.")
    private Integer quantity;

    // update 용
    private Boolean checked;

    public Long getConsumerId() { return consumerId; }
    public void setConsumerId(Long consumerId) { this.consumerId = consumerId; }
    public Integer getSkuId() { return skuId; }
    public void setSkuId(Integer skuId) { this.skuId = skuId; }
    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public Boolean getChecked() { return checked; }
    public void setChecked(Boolean checked) { this.checked = checked; }
}