package com.storeflow.cart.entity;

import jakarta.persistence.*;
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

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected CartGroup() {}

    public CartGroup(Long consumerId, String title, String description) {
        this.consumerId = consumerId;
        this.title = title;
        this.description = description;
    }

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void onUpdate() { updatedAt = LocalDateTime.now(); }

    public void updateInfo(String title, String description) {
        if (title != null && !title.isBlank()) this.title = title.trim();
        if (description != null) this.description = description.trim();
    }

    public Long getCartGroupId() { return cartGroupId; }
    public Long getConsumerId() { return consumerId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}