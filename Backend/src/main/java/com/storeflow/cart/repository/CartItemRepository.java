package com.storeflow.cart.repository;

import com.storeflow.cart.entity.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CartItemRepository extends JpaRepository<CartItem, Long> {

    // 회원 장바구니
    List<CartItem> findByConsumerId(Long consumerId);
    Optional<CartItem> findByConsumerIdAndSkuId(Long consumerId, Integer skuId);
    Optional<CartItem> findByCartItemIdAndConsumerId(Long cartItemId, Long consumerId);

    // 비회원 장바구니 (요구사항: "비회원 장바구니 완성" — sessionId 담기/조회/수정/삭제)
    List<CartItem> findBySessionId(String sessionId);
    Optional<CartItem> findBySessionIdAndSkuId(String sessionId, Integer skuId);
    Optional<CartItem> findByCartItemIdAndSessionId(Long cartItemId, String sessionId);
}