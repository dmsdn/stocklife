package com.storeflow.coupon.repository;

import com.storeflow.coupon.entity.Coupon;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface CouponRepository extends JpaRepository<Coupon, Long> {
    List<Coupon> findByActiveTrueAndValidFromLessThanEqualAndValidUntilGreaterThanEqual(
            LocalDateTime validFrom, LocalDateTime validUntil);
}
