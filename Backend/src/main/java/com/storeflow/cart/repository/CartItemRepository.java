package com.storeflow.cart.repository;

import com.storeflow.cart.entity.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CartItemRepository extends JpaRepository<CartItem, Long> {
    List<CartItem> findByConsumerId(Long consumerId);
    Optional<CartItem> findByConsumerIdAndSkuId(Long consumerId, Integer skuId);
    Optional<CartItem> findByCartItemIdAndConsumerId(Long cartItemId, Long consumerId);
}