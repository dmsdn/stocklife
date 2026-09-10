package com.storeflow.cart.dto;

import jakarta.validation.constraints.Min;

public class UpdateCartItemRequest {

    @Min(value = 1, message = "수량은 1개 이상이어야 합니다.")
    private Integer quantity; // null이면 수량 변경 안 함

    private Boolean checked;  // null이면 체크 상태 변경 안 함

    /**
     * 이 항목을 매장에서 바코드로 스캔했는지(09-10 프론트 요청서).
     *
     * null  = 이 필드 때문에 아무것도 안 바뀐다(기존 수동 수량 조정 경로 그대로).
     * true  = 스캔했다. scanned_at 이 비어 있었으면 지금 시각으로 채우고 수량을 1로
     *         재설정하고(계획 수량은 버린다), 이미 차 있었으면 수량만 +1 한다.
     * false = 계획 상태로 되돌린다(scanned_at = null). 수량은 안 건드린다.
     *
     * ⚠ scanned 가 true 로 오면 같은 요청의 quantity 는 무시한다 — 스캔 수량은 서버가
     *   "몇 번 찍혔는지"로만 정해야 하기 때문이다. 클라이언트가 계산한 값을 받으면
     *   중복 요청 한 번에 개수가 어긋난다.
     */
    private Boolean scanned;

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public Boolean getChecked() { return checked; }
    public void setChecked(Boolean checked) { this.checked = checked; }
    public Boolean getScanned() { return scanned; }
    public void setScanned(Boolean scanned) { this.scanned = scanned; }
}