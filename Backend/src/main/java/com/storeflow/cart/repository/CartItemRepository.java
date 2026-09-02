package com.storeflow.cart.repository;

import com.storeflow.cart.entity.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CartItemRepository extends JpaRepository<CartItem, Long> {

    List<CartItem> findByCartGroupId(Long cartGroupId);

    Optional<CartItem> findByCartGroupIdAndSkuId(
            Long cartGroupId,
            Integer skuId
    );

    /**
     * 과거 DB에 중복 행이 남아 있어도 서비스에서 병합할 수 있도록 전체 행을 조회한다.
     * 정상 DB에서는 UNIQUE(cart_group_id, sku_id) 때문에 결과가 0~1건이다.
     */
    List<CartItem> findAllByCartGroupIdAndSkuIdOrderByCartItemIdAsc(
            Long cartGroupId,
            Integer skuId
    );

    Optional<CartItem> findByCartItemIdAndCartGroupId(
            Long cartItemId,
            Long cartGroupId
    );

    void deleteByCartGroupId(Long cartGroupId);

    @Query("""
        select ci
        from CartItem ci, CartGroup cg
        where ci.cartGroupId = cg.cartGroupId
          and cg.consumerId = :consumerId
    """)
    List<CartItem> findByConsumerId(
            @Param("consumerId") Long consumerId
    );

    @Query("""
        select ci
        from CartItem ci, CartGroup cg
        where ci.cartGroupId = cg.cartGroupId
          and cg.consumerId = :consumerId
          and ci.skuId = :skuId
    """)
    Optional<CartItem> findFirstByConsumerIdAndSkuId(
            @Param("consumerId") Long consumerId,
            @Param("skuId") Integer skuId
    );

    @Query("""
        select ci
        from CartItem ci, CartGroup cg
        where ci.cartGroupId = cg.cartGroupId
          and cg.consumerId = :consumerId
          and ci.cartItemId = :cartItemId
    """)
    Optional<CartItem> findByCartItemIdAndConsumerId(
            @Param("cartItemId") Long cartItemId,
            @Param("consumerId") Long consumerId
    );

    @Query("""
        select distinct cg.consumerId
        from CartItem ci, CartGroup cg
        where ci.cartGroupId = cg.cartGroupId
          and ci.skuId = :skuId
    """)
    List<Long> findConsumerIdsBySkuId(
            @Param("skuId") Integer skuId
    );
}