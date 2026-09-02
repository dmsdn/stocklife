package com.storeflow.purchase.dto;

/**
 * "이 회원이 어떤 카테고리를 많이/얼마나 샀는가" 집계 응답. 취향 추천(청소용품을 많이 샀으면
 * 새로 들어온 청소용품/할인 중인 청소용품 추천)의 1단계 입력이자, 소비 분석(대분류별 지출 금액)
 * 화면의 데이터 소스로도 쓴다.
 * 개인 구매내역 원문이 아니라 카테고리 단위 합계만 담는다.
 */
public class CategoryPreferenceResponse {
    private String categoryL1;
    private String categoryL2;
    private long totalQty;        // 최근 기간 동안 이 카테고리에서 산 총 수량
    private long purchaseCount;   // 이 카테고리 상품을 산 횟수(구매 건수, 수량 아님)
    private long totalSpentKrw;   // 최근 기간 동안 이 카테고리에서 지출한 총 금액(qty * unitPriceKrw 합)

    public CategoryPreferenceResponse(String categoryL1, String categoryL2, long totalQty,
                                      long purchaseCount, long totalSpentKrw) {
        this.categoryL1 = categoryL1;
        this.categoryL2 = categoryL2;
        this.totalQty = totalQty;
        this.purchaseCount = purchaseCount;
        this.totalSpentKrw = totalSpentKrw;
    }

    public String getCategoryL1() { return categoryL1; }
    public String getCategoryL2() { return categoryL2; }
    public long getTotalQty() { return totalQty; }
    public long getPurchaseCount() { return purchaseCount; }
    public long getTotalSpentKrw() { return totalSpentKrw; }
}