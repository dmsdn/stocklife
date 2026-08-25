package com.storeflow.coupon.service;

import com.storeflow.coupon.dto.CouponResponse;
import com.storeflow.coupon.dto.CouponSummaryResponse;
import com.storeflow.coupon.entity.ConsumerCoupon;
import com.storeflow.coupon.entity.Coupon;
import com.storeflow.coupon.repository.ConsumerCouponRepository;
import com.storeflow.coupon.repository.CouponRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class CouponService {

    public record AppliedCoupon(Long consumerCouponId, int discountAmount) {}

    private final CouponRepository couponRepository;
    private final ConsumerCouponRepository consumerCouponRepository;

    public CouponService(CouponRepository couponRepository,
                         ConsumerCouponRepository consumerCouponRepository) {
        this.couponRepository = couponRepository;
        this.consumerCouponRepository = consumerCouponRepository;
    }

    /**
     * 데모 정책: 현재 활성화된 기본 쿠폰은 모든 회원에게 1장씩 자동 발급한다.
     * UNIQUE(consumer_id, coupon_id) 때문에 같은 쿠폰이 중복 발급되지 않는다.
     */
    @Transactional
    public void ensureDefaultCouponsIssued(Long consumerId) {
        LocalDateTime now = LocalDateTime.now();
        List<Coupon> activeCoupons = couponRepository
                .findByActiveTrueAndValidFromLessThanEqualAndValidUntilGreaterThanEqual(now, now);

        for (Coupon coupon : activeCoupons) {
            if (!consumerCouponRepository.existsByConsumerIdAndCoupon_CouponId(consumerId, coupon.getCouponId())) {
                consumerCouponRepository.save(new ConsumerCoupon(consumerId, coupon));
            }
        }
    }

    @Transactional
    public CouponSummaryResponse getMyCoupons(Long consumerId) {
        ensureDefaultCouponsIssued(consumerId);
        LocalDateTime now = LocalDateTime.now();

        List<ConsumerCoupon> owned = consumerCouponRepository.findAllWithCouponByConsumerId(consumerId);
        owned.forEach(cc -> cc.expireIfNeeded(now));

        List<CouponResponse> responses = owned.stream().map(CouponResponse::new).toList();
        return new CouponSummaryResponse(responses);
    }

    @Transactional
    public AppliedCoupon validateAndCalculate(Long consumerId, Long consumerCouponId, int originalAmount) {
        if (consumerCouponId == null) return new AppliedCoupon(null, 0);

        ensureDefaultCouponsIssued(consumerId);
        LocalDateTime now = LocalDateTime.now();
        ConsumerCoupon consumerCoupon = consumerCouponRepository
                .findOwnedWithCoupon(consumerCouponId, consumerId)
                .orElseThrow(() -> new IllegalStateException("보유하지 않은 쿠폰입니다."));

        consumerCoupon.expireIfNeeded(now);
        if (consumerCoupon.getStatus() != ConsumerCoupon.Status.AVAILABLE
                || !consumerCoupon.getCoupon().isUsableAt(now)) {
            throw new IllegalStateException("사용할 수 없는 쿠폰입니다.");
        }

        Coupon coupon = consumerCoupon.getCoupon();
        if (originalAmount < coupon.getMinOrderAmount()) {
            throw new IllegalStateException(
                    String.format("이 쿠폰은 %,d원 이상 구매 시 사용할 수 있습니다.", coupon.getMinOrderAmount()));
        }

        int discount = coupon.calculateDiscount(originalAmount);
        if (discount <= 0) {
            throw new IllegalStateException("쿠폰 할인 금액을 계산할 수 없습니다.");
        }
        return new AppliedCoupon(consumerCouponId, discount);
    }

    @Transactional
    public void markUsed(Long consumerId, Long consumerCouponId, Long orderId) {
        if (consumerCouponId == null) return;
        ConsumerCoupon consumerCoupon = consumerCouponRepository
                .findOwnedWithCoupon(consumerCouponId, consumerId)
                .orElseThrow(() -> new IllegalStateException("보유하지 않은 쿠폰입니다."));
        consumerCoupon.use(orderId, LocalDateTime.now());
    }

    @Transactional
    public void restoreForRefund(Long orderId) {
        consumerCouponRepository.findByUsedOrderId(orderId)
                .ifPresent(cc -> cc.restoreAfterRefund(LocalDateTime.now()));
    }
}
