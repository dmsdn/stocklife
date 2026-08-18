package com.storeflow.product.repository;

import com.storeflow.product.entity.Product;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Integer> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Product> findWithLockBySkuId(Integer skuId);

    Optional<Product> findByBarcode(String barcode);

    List<Product> findByCategoryL2AndSkuIdNotAndLifecycleStatus(
            String categoryL2,
            Integer excludeSkuId,
            Product.LifecycleStatus lifecycleStatus
    );

    List<Product> findBySkuIdInAndLifecycleStatus(
            List<Integer> skuIds,
            Product.LifecycleStatus lifecycleStatus
    );

    @Query("""
        SELECT p FROM Product p
        WHERE p.lifecycleStatus = com.storeflow.product.entity.Product.LifecycleStatus.ACTIVE
          AND (
                LOWER(p.name) LIKE LOWER(CONCAT('%', :keyword, '%'))
             OR LOWER(p.brand) LIKE LOWER(CONCAT('%', :keyword, '%'))
             OR LOWER(p.categoryL1) LIKE LOWER(CONCAT('%', :keyword, '%'))
             OR LOWER(p.categoryL2) LIKE LOWER(CONCAT('%', :keyword, '%'))
          )
        ORDER BY p.skuId ASC
        """)
    List<Product> searchByKeyword(@Param("keyword") String keyword);

    @Query("""
        SELECT p FROM Product p
        WHERE p.lifecycleStatus = com.storeflow.product.entity.Product.LifecycleStatus.ACTIVE
          AND (p.categoryL1 = :categoryHint OR p.categoryL2 = :categoryHint)
        ORDER BY p.skuId ASC
        """)
    List<Product> findByCategoryHint(@Param("categoryHint") String categoryHint);

    List<Product> findByLifecycleStatusAndPriceKrwBetween(
            Product.LifecycleStatus lifecycleStatus,
            int minPrice,
            int maxPrice
    );

    @Query("""
        SELECT p FROM Product p
        WHERE p.lifecycleStatus = com.storeflow.product.entity.Product.LifecycleStatus.ACTIVE
          AND p.categoryL2 = :categoryL2
          AND p.skuId <> :excludeSkuId
          AND p.priceKrw BETWEEN :minPrice AND :maxPrice
          AND LOWER(p.name) LIKE LOWER(CONCAT('%', :itemKeyword, '%'))
        ORDER BY ABS(p.priceKrw - :originalPrice) ASC, p.skuId ASC
        """)
    List<Product> findAlternativesByKeyword(
            @Param("categoryL2") String categoryL2,
            @Param("excludeSkuId") Integer excludeSkuId,
            @Param("minPrice") int minPrice,
            @Param("maxPrice") int maxPrice,
            @Param("itemKeyword") String itemKeyword,
            @Param("originalPrice") int originalPrice
    );

    @Query("""
        SELECT p FROM Product p
        WHERE p.lifecycleStatus = com.storeflow.product.entity.Product.LifecycleStatus.ACTIVE
          AND p.categoryL2 = :categoryL2
          AND p.skuId <> :excludeSkuId
          AND p.priceKrw BETWEEN :minPrice AND :maxPrice
        ORDER BY ABS(p.priceKrw - :originalPrice) ASC, p.skuId ASC
        """)
    List<Product> findAlternativesByPriceBand(
            @Param("categoryL2") String categoryL2,
            @Param("excludeSkuId") Integer excludeSkuId,
            @Param("minPrice") int minPrice,
            @Param("maxPrice") int maxPrice,
            @Param("originalPrice") int originalPrice
    );

    /**
     * 요구사항 8번 search_products용 조건부 검색.
     * onPromoOnly=true일 때만 현재 진행 중 프로모션을 가진 상품으로 제한한다.
     */
    @Query("""
        SELECT p FROM Product p
        WHERE p.lifecycleStatus = :activeStatus
          AND (
                :keyword IS NULL
             OR LOWER(p.name) LIKE LOWER(CONCAT('%', :keyword, '%'))
             OR LOWER(p.categoryL1) LIKE LOWER(CONCAT('%', :keyword, '%'))
             OR LOWER(p.categoryL2) LIKE LOWER(CONCAT('%', :keyword, '%'))
             OR LOWER(p.brand) LIKE LOWER(CONCAT('%', :keyword, '%'))
          )
          AND (:categoryL1 IS NULL OR p.categoryL1 = :categoryL1)
          AND (:categoryL2 IS NULL OR p.categoryL2 = :categoryL2)
          AND (:maxPrice IS NULL OR p.priceKrw <= :maxPrice)
          AND (:sinceDate IS NULL OR p.firstStockedAt >= :sinceDate)
          AND (
                :onPromoOnly = false
             OR EXISTS (
                    SELECT pr.promoId
                    FROM Promotion pr
                    WHERE pr.skuId = p.skuId
                      AND pr.startsAt <= :now
                      AND pr.endsAt >= :now
                )
          )
        ORDER BY
          CASE
            WHEN :keyword IS NOT NULL
             AND LOWER(p.name) LIKE LOWER(CONCAT('%', :keyword, '%')) THEN 0
            ELSE 1
          END,
          p.name ASC
        """)
    List<Product> search(
            @Param("activeStatus") Product.LifecycleStatus activeStatus,
            @Param("keyword") String keyword,
            @Param("categoryL1") String categoryL1,
            @Param("categoryL2") String categoryL2,
            @Param("maxPrice") Integer maxPrice,
            @Param("sinceDate") LocalDate sinceDate,
            @Param("onPromoOnly") boolean onPromoOnly,
            @Param("now") Instant now
    );
}
