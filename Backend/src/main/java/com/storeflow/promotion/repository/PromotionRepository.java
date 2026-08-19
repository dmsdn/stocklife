package com.storeflow.promotion.repository;

import com.storeflow.promotion.entity.Promotion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface PromotionRepository extends JpaRepository<Promotion, Long> {

    /**
     * 주어진 skuId 목록 중 "지금 이 순간" 진행 중인 행사만 배치로 가져온다.
     * 상품 검색/비교 응답에 정가가 아니라 행사가를 함께 실어 보내기 위한 용도.
     * (검색 API의 onPromoOnly 필터와 같은 "startsAt <= now <= endsAt" 조건)
     */
    @Query("""
        SELECT pr FROM Promotion pr
        WHERE pr.skuId IN :skuIds
          AND pr.startsAt <= :now
          AND pr.endsAt >= :now
        """)
    List<Promotion> findActiveBySkuIdIn(@Param("skuIds") List<Integer> skuIds, @Param("now") Instant now);

    @Query("""
        SELECT pr FROM Promotion pr
        WHERE pr.skuId = :skuId
          AND pr.startsAt <= :now
          AND pr.endsAt >= :now
        """)
    List<Promotion> findActiveBySkuId(@Param("skuId") Integer skuId, @Param("now") Instant now);
}