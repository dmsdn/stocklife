package com.storeflow.order.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "consumer_id", nullable = false)
    private Long consumerId;

    /** 쿠폰 적용 전 상품 합계. */
    @Column(name = "original_amount", nullable = false)
    private int originalAmount;

    /** 쿠폰 할인 금액. */
    @Column(name = "discount_amount", nullable = false)
    private int discountAmount;

    /** 실제 사용한 회원 보유 쿠폰 ID. */
    @Column(name = "consumer_coupon_id")
    private Long consumerCouponId;

    /** 실제 결제 금액 = originalAmount - discountAmount. */
    @Column(name = "total_amount", nullable = false)
    private int totalAmount;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL)
    private List<OrderItem> orderItems = new ArrayList<>();

    protected Order() {}

    public Order(Long consumerId) {
        this.consumerId = consumerId;
        this.status = "PAID";
        this.originalAmount = 0;
        this.discountAmount = 0;
        this.totalAmount = 0;
    }

    public void addItem(OrderItem item) {
        this.orderItems.add(item);
        item.assignOrder(this);
        int itemAmount = item.getPriceKrw() * item.getQuantity();
        this.originalAmount += itemAmount;
        this.totalAmount = this.originalAmount - this.discountAmount;
    }

    public void applyCoupon(Long consumerCouponId, int discountAmount) {
        if (discountAmount < 0) throw new IllegalArgumentException("할인 금액은 0 이상이어야 합니다.");
        this.consumerCouponId = consumerCouponId;
        this.discountAmount = Math.min(discountAmount, originalAmount);
        this.totalAmount = originalAmount - this.discountAmount;
    }

    public void requestRefund() {
        if (!"PAID".equals(status)) {
            throw new IllegalStateException("결제 완료 상태에서만 환불을 요청할 수 있습니다. 현재 상태=" + status);
        }
        this.status = "REFUND_REQUESTED";
    }

    public void approveRefund() {
        if (!"REFUND_REQUESTED".equals(status)) {
            throw new IllegalStateException("환불 요청 상태에서만 승인할 수 있습니다. 현재 상태=" + status);
        }
        this.status = "REFUNDED";
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getOrderId() { return orderId; }
    public int getOriginalAmount() { return originalAmount; }
    public int getDiscountAmount() { return discountAmount; }
    public Long getConsumerCouponId() { return consumerCouponId; }
    public int getTotalAmount() { return totalAmount; }
    public String getStatus() { return status; }
    public List<OrderItem> getOrderItems() { return orderItems; }
}
