package com.storeflow.purchase.dto;

/**
 * Agent가 상품 반응/인기도를 판단할 때 사용하는 집계 지표.
 * 원시 이벤트/구매행을 Agent에 넘기지 않고 Backend가 숫자로 확정해서 반환한다.
 *
 * searchCount30d는 consumer_events.SEARCH 중 sku_id가 채워진 이벤트만 집계한다.
 * 현재 검색 이벤트가 검색어(payload)만 기록하고 sku_id를 비워 보내면 이 값은 0으로 나온다.
 */
public record ProductMetricsResponse(
        Integer skuId,
        String productName,
        long salesQty30d,
        long salesQtyTotal,
        long cartAddCount30d,
        long searchCount30d,
        long viewCount30d,
        long uniqueBuyerCount,
        long repeatBuyerCount,
        double repurchaseRate
) {
}
