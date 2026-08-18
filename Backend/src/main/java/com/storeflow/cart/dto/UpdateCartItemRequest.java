package com.storeflow.cart.dto;

import jakarta.validation.constraints.Min;

public class UpdateCartItemRequest {

    @Min(value = 1, message = "수량은 1개 이상이어야 합니다.")
    private Integer quantity; // null이면 수량 변경 안 함

    private Boolean checked;  // null이면 체크 상태 변경 안 함

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public Boolean getChecked() { return checked; }
    public void setChecked(Boolean checked) { this.checked = checked; }
}