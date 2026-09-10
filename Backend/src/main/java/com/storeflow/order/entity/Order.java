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

    @Column(name = "total_amount", nullable = false)
    private int totalAmount;

    @Column(name = "status", nullable = false)
    private String status;

    // 이 주문에서 실제로 사용/적립된 포인트. 환불 시 정확히 되돌리기 위해 주문 단위로 기록해둔다
    // (나중에 적립률이 바뀌어도 이 주문 당시 적립분은 그대로 보존됨).
    @Column(name = "points_used", nullable = false)
    private int pointsUsed = 0;

    @Column(name = "points_earned", nullable = false)
    private int pointsEarned = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL)
    private List<OrderItem> orderItems = new ArrayList<>();

    protected Order() {}

    public Order(Long consumerId) {
        this.consumerId = consumerId;
        this.status = "PAID"; // 가상 결제라 생성 즉시 결제완료 처리
        this.totalAmount = 0;
    }

    /** Explicit synthetic demo receipt; no payment, stock sale or points are generated. */
    public static Order demoHistory(Long consumerId, LocalDateTime purchasedAt) {
        Order order = new Order(consumerId);
        order.createdAt = java.util.Objects.requireNonNull(purchasedAt);
        return order;
    }

    public void addItem(OrderItem item) {
        this.orderItems.add(item);
        item.assignOrder(this);
        this.totalAmount += item.getPriceKrw() * item.getQuantity();
    }

    /** 33번: 환불 요청 접수. PAID 상태에서만 가능. */
    public void requestRefund() {
        if (!"PAID".equals(status)) {
            throw new IllegalStateException("결제 완료 상태에서만 환불을 요청할 수 있습니다. 현재 상태=" + status);
        }
        this.status = "REFUND_REQUESTED";
    }

    /** 33번: 환불 승인. REFUND_REQUESTED 상태에서만 가능. */
    public void approveRefund() {
        if (!"REFUND_REQUESTED".equals(status)) {
            throw new IllegalStateException("환불 요청 상태에서만 승인할 수 있습니다. 현재 상태=" + status);
        }
        this.status = "REFUNDED";
    }

    @PrePersist
    protected void onCreate() {
        if (this.createdAt == null) this.createdAt = LocalDateTime.now();
    }

    /** 5-3(포인트 사용): checkout에서 이 주문에 사용한 포인트 수량을 기록. */
    public void applyPointsUsed(int pointsUsed) {
        this.pointsUsed = pointsUsed;
    }

    /** 5-5(포인트 적립): checkout에서 이 주문으로 실제 적립된 포인트 수량을 기록. */
    public void applyPointsEarned(int pointsEarned) {
        this.pointsEarned = pointsEarned;
    }

    public Long getOrderId() { return orderId; }
    public int getTotalAmount() { return totalAmount; }
    public String getStatus() { return status; }
    public int getPointsUsed() { return pointsUsed; }
    public int getPointsEarned() { return pointsEarned; }
    public List<OrderItem> getOrderItems() { return orderItems; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}