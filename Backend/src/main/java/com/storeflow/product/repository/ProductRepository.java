package com.storeflow.product.repository;

import com.storeflow.product.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Integer> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Product> findWithLockBySkuId(Integer skuId);

    List<Product> findByCategoryAndSkuIdNotAndActiveTrue(String category, Integer excludeSkuId);

    @Query("""
        SELECT p FROM Product p
        WHERE p.name LIKE %:keyword%
           OR p.category LIKE %:keyword%
           OR p.brand LIKE %:keyword%
        ORDER BY
           CASE WHEN p.name LIKE %:keyword% THEN 0 ELSE 1 END,
           p.name
        """)
    List<Product> searchByKeyword(@Param("keyword") String keyword);
}