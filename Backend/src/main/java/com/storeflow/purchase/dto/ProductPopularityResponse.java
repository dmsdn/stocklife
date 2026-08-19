package com.storeflow.purchase.dto;

/**
 * "다른 사람들은 보통 뭘 사?" / "A가 B보다 더 잘 나가나?" 같은 질문에 답하기 위한
 * 상품별 집계 응답. 개인 구매이력(purchases.member_id)을 절대 노출하지 않고
 * 합계·구매자 수만 반환한다.
 */
public class ProductPopularityResponse {
    private Integer skuId;
    private String productName;
    private String imageUrl;
    private long totalQty;          // 최근 기간 동안 팔린 총 수량
    private long purchaserCount;    // 구매한 서로 다른 회원 수(=인기도 지표)

    public ProductPopularityResponse(Integer skuId, String productName, String imageUrl,
                                      long totalQty, long purchaserCount) {
        this.skuId = skuId;
        this.productName = productName;
        this.imageUrl = imageUrl;
        this.totalQty = totalQty;
        this.purchaserCount = purchaserCount;
    }

    public Integer getSkuId() { return skuId; }
    public String getProductName() { return productName; }
    public String getImageUrl() { return imageUrl; }
    public long getTotalQty() { return totalQty; }
    public long getPurchaserCount() { return purchaserCount; }
}
