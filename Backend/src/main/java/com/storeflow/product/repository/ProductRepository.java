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
            String categoryL2, Integer excludeSkuId, Product.LifecycleStatus lifecycleStatus);

    /**
     * search_products(8번). 조건은 전부 AND — 파라미터가 null(또는 onPromoOnly=false)이면
     * 그 조건은 그냥 통과시킨다. 단종 상품은 검색 결과에서 제외(get_product는 별도로 단종도 조회됨).
     */
    @Query("""
        SELECT p FROM Product p
        WHERE p.lifecycleStatus = :activeStatus
          AND (:keyword IS NULL OR p.name LIKE %:keyword% OR p.categoryL1 LIKE %:keyword%
               OR p.categoryL2 LIKE %:keyword% OR p.brand LIKE %:keyword%)
          AND (:categoryL1 IS NULL OR p.categoryL1 = :categoryL1)
          AND (:categoryL2 IS NULL OR p.categoryL2 = :categoryL2)
          AND (:maxPrice IS NULL OR p.priceKrw <= :maxPrice)
          AND (:sinceDate IS NULL OR p.firstStockedAt >= :sinceDate)
          AND (:onPromoOnly = false OR EXISTS (
                SELECT 1 FROM Promotion pr
                WHERE pr.skuId = p.skuId AND :now BETWEEN pr.startsAt AND pr.endsAt))
        ORDER BY
          CASE WHEN :keyword IS NOT NULL AND p.name LIKE %:keyword% THEN 0 ELSE 1 END,
          p.name
        """)
    List<Product> search(@Param("activeStatus") Product.LifecycleStatus activeStatus,
                          @Param("keyword") String keyword,
                          @Param("categoryL1") String categoryL1,
                          @Param("categoryL2") String categoryL2,
                          @Param("maxPrice") Integer maxPrice,
                          @Param("sinceDate") LocalDate sinceDate,
                          @Param("onPromoOnly") boolean onPromoOnly,
                          @Param("now") Instant now);
}