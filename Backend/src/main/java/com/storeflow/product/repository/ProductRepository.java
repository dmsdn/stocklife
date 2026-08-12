package com.storeflow.product.repository;

import com.storeflow.product.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Integer> {

    // 동시에 여러 명이 같은 상품을 주문할 때 재고가 꼬이지 않도록 비관적 락 사용
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Product> findWithLockBySkuId(Integer skuId);
}