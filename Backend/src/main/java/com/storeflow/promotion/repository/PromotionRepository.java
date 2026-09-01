package com.storeflow.promotion.repository;

import com.storeflow.promotion.entity.Promotion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface PromotionRepository extends JpaRepository<Promotion, Long> {

    @Query("""
        SELECT pr FROM Promotion pr
        WHERE pr.skuId IN :skuIds
          AND pr.startsAt <= :now
          AND pr.endsAt >= :now
        """)
    List<Promotion> findActiveBySkuIdIn(
            @Param("skuIds") List<Integer> skuIds,
            @Param("now") Instant now
    );

    @Query("""
        SELECT pr FROM Promotion pr
        WHERE pr.skuId = :skuId
          AND pr.startsAt <= :now
          AND pr.endsAt >= :now
        """)
    List<Promotion> findActiveBySkuId(
            @Param("skuId") Integer skuId,
            @Param("now") Instant now
    );

    @Query("""
        SELECT pr FROM Promotion pr
        WHERE pr.startsAt >= :start
          AND pr.startsAt < :end
        """)
    List<Promotion> findStartingBetween(
            @Param("start") Instant start,
            @Param("end") Instant end
    );
}