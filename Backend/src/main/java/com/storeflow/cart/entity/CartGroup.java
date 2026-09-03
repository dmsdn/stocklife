package com.storeflow.cart.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "cart_group")
public class CartGroup {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "cart_group_id")
    private Long cartGroupId;

    @Column(name = "consumer_id", nullable = false)
    private Long consumerId;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "description", length = 255)
    private String description;

    // 장 볼 날짜(선택) — 언제 장을 볼 계획인지. 미입력 시 null.
    @Column(name = "shopping_date")
    private LocalDate shoppingDate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected CartGroup() {}

    public CartGroup(Long consumerId, String title, String description) {
        this(consumerId, title, description, null);
    }

    public CartGroup(Long consumerId, String title, String description, LocalDate shoppingDate) {
        this.consumerId = consumerId;
        this.title = title;
        this.description = description;
        this.shoppingDate = shoppingDate;
    }

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void onUpdate() { updatedAt = LocalDateTime.now(); }

    public void updateInfo(String title, String description) {
    assertNotCompleted();
    if (title != null && !title.isBlank()) this.title = title.trim();
    if (description != null) this.description = description.trim();
    }

    /** 장 볼 날짜 수정. null이 넘어오면 "미입력 상태로 지운다"는 의미로 그대로 반영한다. */
    public void updateShoppingDate(LocalDate shoppingDate) {
    assertNotCompleted();
    this.shoppingDate = shoppingDate;
    }

    /** 결제 완료 후 잠금 — 체크아웃 성공 시 OrderService에서 호출. */
    public void markCompleted() {
        this.status = Status.COMPLETED;
    }

    public boolean isCompleted() {
        return status == Status.COMPLETED;
    }

    private void assertNotCompleted() {
        if (status == Status.COMPLETED) {
            throw new IllegalStateException("결제 완료된 리스트는 수정할 수 없습니다.");
        }
    }

    public Status getStatus() { return status; }

    public Long getCartGroupId() { return cartGroupId; }
    public Long getConsumerId() { return consumerId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public LocalDate getShoppingDate() { return shoppingDate; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    public enum Status { ACTIVE, COMPLETED }

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.ACTIVE;
}