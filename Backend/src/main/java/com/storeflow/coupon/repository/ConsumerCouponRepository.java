package com.storeflow.coupon.repository;

import com.storeflow.coupon.entity.ConsumerCoupon;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ConsumerCouponRepository extends JpaRepository<ConsumerCoupon, Long> {

    boolean existsByConsumerIdAndCoupon_CouponId(Long consumerId, Long couponId);

    @Query("select cc from ConsumerCoupon cc join fetch cc.coupon " +
           "where cc.consumerId = :consumerId order by cc.issuedAt desc")
    List<ConsumerCoupon> findAllWithCouponByConsumerId(@Param("consumerId") Long consumerId);

    @Query("select cc from ConsumerCoupon cc join fetch cc.coupon " +
           "where cc.consumerCouponId = :id and cc.consumerId = :consumerId")
    Optional<ConsumerCoupon> findOwnedWithCoupon(@Param("id") Long id,
                                                  @Param("consumerId") Long consumerId);

    @Query("select cc from ConsumerCoupon cc join fetch cc.coupon where cc.usedOrderId = :orderId")
    Optional<ConsumerCoupon> findByUsedOrderId(@Param("orderId") Long orderId);
}
