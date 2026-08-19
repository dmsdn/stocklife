package com.storeflow.cart.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 요구사항 30: 장바구니는 "비회원은 세션 기준, 회원은 계정 기준"으로 담긴다.
 * consumerId / sessionId 중 정확히 하나만 채워진다 — 회원이면 consumerId, 비회원이면 sessionId.
 * DB에도 chk_cart_owner CHECK 제약으로 "둘 다 NULL"은 막아뒀다(migration_guest_cart_v1.sql).
 *
 * 요구사항 29: 로그인 시 CartService.claimGuestCart()가 sessionId로 남아있던 이 회원의
 * 비회원 카트를 찾아 consumerId를 채워 넣고 sessionId는 비운다(승계).
 */
@Entity
@Table(name = "cart_item")
public class CartItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "cart_item_id")
    private Long cartItemId;

    @Column(name = "consumer_id")
    private Long consumerId;

    @Column(name = "session_id", length = 64)
    private String sessionId;

    @Column(name = "sku_id", nullable = false)
    private Integer skuId;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "is_checked", nullable = false)
    private boolean checked;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected CartItem() {}

    /** 회원 카트 항목. */
    public CartItem(Long consumerId, Integer skuId, int quantity) {
        this(consumerId, null, skuId, quantity);
    }

    /** 비회원 카트 항목. */
    public static CartItem forGuest(String sessionId, Integer skuId, int quantity) {
        return new CartItem(null, sessionId, skuId, quantity);
    }

    private CartItem(Long consumerId, String sessionId, Integer skuId, int quantity) {
        if (consumerId == null && (sessionId == null || sessionId.isBlank())) {
            throw new IllegalArgumentException("consumerId 또는 sessionId 중 하나는 필수입니다.");
        }
        this.consumerId = consumerId;
        this.sessionId = sessionId;
        this.skuId = skuId;
        this.quantity = quantity;
        this.checked = true; // 기본값: 담으면 체크된 상태로 시작
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public void increaseQuantity(int amount) {
        this.quantity += amount;
    }

    public void changeQuantity(int quantity) {
        if (quantity < 1) {
            throw new IllegalArgumentException("수량은 1개 이상이어야 합니다.");
        }
        this.quantity = quantity;
    }

    public void toggleChecked(boolean checked) {
        this.checked = checked;
    }

    /** 요구사항 29: 로그인 성공 시 비회원 항목을 이 회원 소유로 바꾼다. */
    public void claimBy(Long consumerId) {
        this.consumerId = consumerId;
        this.sessionId = null;
    }

    // getters
    public Long getCartItemId() { return cartItemId; }
    public Long getConsumerId() { return consumerId; }
    public String getSessionId() { return sessionId; }
    public Integer getSkuId() { return skuId; }
    public int getQuantity() { return quantity; }
    public boolean isChecked() { return checked; }
}