package com.storeflow.order.dto;

import com.storeflow.order.repository.FrequentPurchaseProjection;

public class FrequentPurchaseResponse {

    private final Integer skuId;
    private final String productName;
    private final long purchaseCount;
    private final int suggestedQuantity; // 평균 구매 수량을 반올림한 값 (장바구니에 담을 때 기본값으로 사용)

    public FrequentPurchaseResponse(FrequentPurchaseProjection p) {
        this.skuId = p.getSkuId();
        this.productName = p.getProductName();
        this.purchaseCount = p.getPurchaseCount();
        // 평균이 null일 일은 없지만(그룹에 항목이 항상 1개 이상) 방어적으로 최소 1개 보장
        double avg = p.getAvgQuantity() == null ? 1.0 : p.getAvgQuantity();
        this.suggestedQuantity = Math.max(1, (int) Math.round(avg));
    }

    public Integer getSkuId() { return skuId; }
    public String getProductName() { return productName; }
    public long getPurchaseCount() { return purchaseCount; }
    public int getSuggestedQuantity() { return suggestedQuantity; }
}