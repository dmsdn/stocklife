package com.storeflow.purchase.repository;

import com.storeflow.purchase.dto.ProductPopularityResponse;
import com.storeflow.purchase.dto.PurchaseHistoryResponse;
import com.storeflow.purchase.entity.Purchase;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface PurchaseRepository extends JpaRepository<Purchase, Long> {

    /** get_purchase_history. 상품명·이미지까지 조인해서 반환. */
    @Query("""
        SELECT NEW com.storeflow.purchase.dto.PurchaseHistoryResponse(
            p.purchaseId, p.skuId, pr.name, pr.imageUrl, p.qty, p.unitPriceKrw, p.purchasedAt)
        FROM Purchase p, Product pr
        WHERE p.memberId = :memberId AND p.skuId = pr.skuId
        ORDER BY p.purchasedAt DESC
        """)
    List<PurchaseHistoryResponse> findHistoryByMemberId(@Param("memberId") Integer memberId);

    /**
     * "A샴푸보다 B샴푸가 더 잘 나가나?" — 지정한 skuId들만 골라 전체 회원 기준으로 집계한다.
     * 개인별 구매내역은 절대 섞이지 않고 합계·구매자 수만 나간다.
     */
    @Query("""
        SELECT NEW com.storeflow.purchase.dto.ProductPopularityResponse(
            p.skuId, pr.name, pr.imageUrl, SUM(p.qty), COUNT(DISTINCT p.memberId))
        FROM Purchase p, Product pr
        WHERE p.skuId = pr.skuId
          AND p.skuId IN :skuIds
          AND p.purchasedAt >= :since
        GROUP BY p.skuId, pr.name, pr.imageUrl
        """)
    List<ProductPopularityResponse> compareBySkuIds(@Param("skuIds") List<Integer> skuIds,
                                                      @Param("since") Instant since);

    /**
     * "다른 사람들은 보통 뭘 사?" — 카테고리(선택) 안에서 최근 기간 인기 상품 상위 N개.
     * 카테고리를 지정하지 않으면(:categoryL2가 null) 전체 상품 대상.
     */
    @Query("""
        SELECT NEW com.storeflow.purchase.dto.ProductPopularityResponse(
            p.skuId, pr.name, pr.imageUrl, SUM(p.qty), COUNT(DISTINCT p.memberId))
        FROM Purchase p, Product pr
        WHERE p.skuId = pr.skuId
          AND p.purchasedAt >= :since
          AND (:categoryL2 IS NULL OR pr.categoryL2 = :categoryL2)
        GROUP BY p.skuId, pr.name, pr.imageUrl
        ORDER BY SUM(p.qty) DESC
        """)
    List<ProductPopularityResponse> findPopular(@Param("categoryL2") String categoryL2,
                                                  @Param("since") Instant since,
                                                  Pageable pageable);
}