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
        this.createdAt = LocalDateTime.now();
    }

    public Long getOrderId() { return orderId; }
    public int getTotalAmount() { return totalAmount; }
    public String getStatus() { return status; }
    public List<OrderItem> getOrderItems() { return orderItems; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}