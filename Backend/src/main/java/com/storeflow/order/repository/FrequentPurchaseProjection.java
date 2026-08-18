package com.storeflow.order.repository;

/**
 * "내가 항상 구매하는 X" 판단을 위한 반복 구매 집계 결과.
 * OrderRepository.findFrequentPurchases()의 JPQL 결과를 매핑하는 인터페이스 기반 프로젝션이다.
 * Spring Data JPA가 getter 이름(skuId, productName ...)을 보고 자동으로 값을 채워준다.
 */
public interface FrequentPurchaseProjection {

    Integer getSkuId();

    String getProductName();

    // 해당 상품이 주문에 몇 번 등장했는지 (= 몇 번 구매했는지)
    Long getPurchaseCount();

    // 매번 몇 개씩 샀는지의 평균 (예: 2.33개 -> 서비스 레이어에서 반올림해서 씀)
    Double getAvgQuantity();
}