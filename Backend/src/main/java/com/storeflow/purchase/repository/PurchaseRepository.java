package com.storeflow.purchase.repository;

import com.storeflow.purchase.dto.CategoryPreferenceResponse;
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

    /** get_purchase_history. 상품명·이미지·카테고리까지 조인해서 반환. */
    @Query("""
        SELECT NEW com.storeflow.purchase.dto.PurchaseHistoryResponse(
            p.purchaseId, p.skuId, pr.name, pr.imageUrl, pr.categoryL1, pr.categoryL2,
            p.qty, p.unitPriceKrw, p.purchasedAt)
        FROM Purchase p, Product pr
        WHERE p.memberId = :memberId AND p.skuId = pr.skuId
        ORDER BY p.purchasedAt DESC
        """)
    List<PurchaseHistoryResponse> findHistoryByMemberId(@Param("memberId") Integer memberId);

    /**
     * 내부 창구(/internal/purchases/history) 전용 — 소비주기 예측·취향 매칭은 구매 간격을
     * 시각의 나열에서 계산하므로 purchasedAt 오름차순으로 내려준다(개인 이력 화면의
     * findHistoryByMemberId와는 반대 정렬).
     */
    @Query("""
        SELECT NEW com.storeflow.purchase.dto.PurchaseHistoryResponse(
            p.purchaseId, p.skuId, pr.name, pr.imageUrl, pr.categoryL1, pr.categoryL2,
            p.qty, p.unitPriceKrw, p.purchasedAt)
        FROM Purchase p, Product pr
        WHERE p.memberId = :memberId AND p.skuId = pr.skuId
        ORDER BY p.purchasedAt ASC
        """)
    List<PurchaseHistoryResponse> findHistoryByMemberIdOrderByPurchasedAtAsc(@Param("memberId") Integer memberId);

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

    /**
     * "청소용품을 많이 샀으면" 판단의 근거 — 이 회원이 최근 기간 동안 가장 많이 산 카테고리(categoryL1/categoryL2) 순위.
     * 소비 분석 화면(대분류별 지출 금액)의 데이터 소스도 겸한다 — totalSpentKrw = SUM(qty * unitPriceKrw).
     * totalQty(수량 합) 내림차순. 취향 추천은 이 결과의 상위 N개 카테고리를 기준으로
     * 신상/행사 상품(search API)을 다시 조회하는 2단계 구조다 — 이 쿼리 자체는 상품을 추천하지 않는다.
     */
    @Query("""
        SELECT NEW com.storeflow.purchase.dto.CategoryPreferenceResponse(
            pr.categoryL1, pr.categoryL2, SUM(p.qty), COUNT(p), SUM(p.qty * p.unitPriceKrw))
        FROM Purchase p, Product pr
        WHERE p.skuId = pr.skuId
          AND p.memberId = :memberId
          AND p.purchasedAt >= :since
        GROUP BY pr.categoryL1, pr.categoryL2
        ORDER BY SUM(p.qty) DESC
        """)
    List<CategoryPreferenceResponse> findTopCategoriesByMemberId(@Param("memberId") Integer memberId,
                                                                 @Param("since") Instant since,
                                                                 Pageable pageable);

    /**
     * 소비 분석(대분류 + 지출 금액) 화면용 — categoryL2 세분 없이 categoryL1 단위로만 묶어서
     * 이 회원이 최근 기간 동안 대분류별로 얼마나 썼는지 집계한다. totalSpentKrw 내림차순.
     * findTopCategoriesByMemberId는 categoryL2까지 세분해서 묶으므로, 대분류만 필요한
     * 소비 분석 화면에서는 같은 대분류가 여러 행으로 쪼개져 나온다 — 이 쿼리로 대체한다.
     */
    @Query("""
        SELECT NEW com.storeflow.purchase.dto.CategoryPreferenceResponse(
            pr.categoryL1, NULL, SUM(p.qty), COUNT(p), SUM(p.qty * p.unitPriceKrw))
        FROM Purchase p, Product pr
        WHERE p.skuId = pr.skuId
          AND p.memberId = :memberId
          AND p.purchasedAt >= :since
        GROUP BY pr.categoryL1
        ORDER BY SUM(p.qty * p.unitPriceKrw) DESC
        """)
    List<CategoryPreferenceResponse> findSpendingByCategoryL1(@Param("memberId") Integer memberId,
                                                              @Param("since") Instant since);

    /** 상품 지표: 최근 기간 판매수량. */
    @Query("SELECT COALESCE(SUM(p.qty), 0) FROM Purchase p WHERE p.skuId = :skuId AND p.purchasedAt >= :since")
    Long sumQtySince(@Param("skuId") Integer skuId, @Param("since") Instant since);

    /** 상품 지표: 전체 누적 판매수량. */
    @Query("SELECT COALESCE(SUM(p.qty), 0) FROM Purchase p WHERE p.skuId = :skuId")
    Long sumQtyTotal(@Param("skuId") Integer skuId);

    /** 상품 지표: 한 번이라도 구매한 서로 다른 회원 수. */
    @Query("SELECT COUNT(DISTINCT p.memberId) FROM Purchase p WHERE p.skuId = :skuId")
    Long countUniqueBuyers(@Param("skuId") Integer skuId);

    /**
     * 상품 지표: 서로 다른 결제(basket_id)에서 2회 이상 구매한 회원 수.
     * 같은 결제에서 수량을 2개 산 것은 재구매로 세지 않는다.
     */
    @Query(value = """
        SELECT COUNT(*)
        FROM (
            SELECT member_id
            FROM purchases
            WHERE sku_id = :skuId
            GROUP BY member_id
            HAVING COUNT(DISTINCT basket_id) >= 2
        ) repeat_buyers
        """, nativeQuery = true)
    Long countRepeatBuyers(@Param("skuId") Integer skuId);
}