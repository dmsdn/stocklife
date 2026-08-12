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

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getOrderId() { return orderId; }
    public int getTotalAmount() { return totalAmount; }
    public String getStatus() { return status; }
    public List<OrderItem> getOrderItems() { return orderItems; }
}