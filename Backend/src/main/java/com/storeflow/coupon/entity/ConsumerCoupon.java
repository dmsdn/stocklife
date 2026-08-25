package com.storeflow.coupon.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "consumer_coupon",
        uniqueConstraints = @UniqueConstraint(name = "uk_consumer_coupon_once", columnNames = {"consumer_id", "coupon_id"}))
public class ConsumerCoupon {

    public enum Status { AVAILABLE, USED, EXPIRED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "consumer_coupon_id")
    private Long consumerCouponId;

    @Column(name = "consumer_id", nullable = false)
    private Long consumerId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "coupon_id", nullable = false)
    private Coupon coupon;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status;

    @Column(name = "issued_at", nullable = false, updatable = false)
    private LocalDateTime issuedAt;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    @Column(name = "used_order_id")
    private Long usedOrderId;

    protected ConsumerCoupon() {}

    public ConsumerCoupon(Long consumerId, Coupon coupon) {
        this.consumerId = consumerId;
        this.coupon = coupon;
        this.status = Status.AVAILABLE;
        this.issuedAt = LocalDateTime.now();
    }

    public void expireIfNeeded(LocalDateTime now) {
        if (status == Status.AVAILABLE && !coupon.isUsableAt(now)) {
            status = Status.EXPIRED;
        }
    }

    public void use(Long orderId, LocalDateTime now) {
        if (status != Status.AVAILABLE) {
            throw new IllegalStateException("사용할 수 없는 쿠폰입니다.");
        }
        status = Status.USED;
        usedAt = now;
        usedOrderId = orderId;
    }

    public void restoreAfterRefund(LocalDateTime now) {
        if (status != Status.USED) return;
        usedAt = null;
        usedOrderId = null;
        status = coupon.isUsableAt(now) ? Status.AVAILABLE : Status.EXPIRED;
    }

    public Long getConsumerCouponId() { return consumerCouponId; }
    public Long getConsumerId() { return consumerId; }
    public Coupon getCoupon() { return coupon; }
    public Status getStatus() { return status; }
    public LocalDateTime getIssuedAt() { return issuedAt; }
    public LocalDateTime getUsedAt() { return usedAt; }
    public Long getUsedOrderId() { return usedOrderId; }
}
