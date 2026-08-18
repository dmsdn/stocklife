package com.storeflow.order.repository;

import com.storeflow.order.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {

    List<Order> findByConsumerIdOrderByCreatedAtDesc(Long consumerId);

    Optional<Order> findByOrderIdAndConsumerId(Long orderId, Long consumerId);

    /**
     * "내가 항상 구매하는 휴지" 같은 요청을 처리하기 위한 반복 구매 집계.
     *
     * - keyword가 있으면 상품명에 그 키워드가 포함된 것만 대상으로 한다 (예: "휴지").
     * - keyword가 없으면(null) 전체 구매 이력에서 반복 구매 상품을 찾는다.
     * - HAVING COUNT(oi) >= :minCount 로 "주기적으로/자주" 산 것만 걸러낸다.
     *   (한 번만 산 상품은 "항상 구매하는" 상품이 아니므로 제외)
     * - purchaseCount 내림차순 정렬 -> 가장 자주 산 상품이 맨 앞에 온다.
     *
     * 가격/재고 등은 여기서 다루지 않는다. 이 쿼리는 "무엇을 얼마나 자주/몇 개씩 샀는가"만
     * 알려주고, 실제 장바구니에 담을 때 필요한 최신 가격/판매 여부는 Product 테이블에서
     * 다시 확인해야 한다 (AI 서버 쪽 add_to_cart가 이미 그 역할을 한다).
     */
    @Query("""
            SELECT oi.skuId AS skuId,
                   oi.productName AS productName,
                   COUNT(oi) AS purchaseCount,
                   AVG(oi.quantity) AS avgQuantity
            FROM Order o JOIN o.orderItems oi
            WHERE o.consumerId = :consumerId
              AND (:keyword IS NULL OR oi.productName LIKE CONCAT('%', :keyword, '%'))
            GROUP BY oi.skuId, oi.productName
            HAVING COUNT(oi) >= :minCount
            ORDER BY COUNT(oi) DESC
            """)
    List<FrequentPurchaseProjection> findFrequentPurchases(
            @Param("consumerId") Long consumerId,
            @Param("keyword") String keyword,
            @Param("minCount") long minCount
    );
}