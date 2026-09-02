package com.storeflow.cart.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "cart_item",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_cart_item_group_sku",
                columnNames = {"cart_group_id", "sku_id"}
        )
)
public class CartItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "cart_item_id")
    private Long cartItemId;

    @Column(name = "cart_group_id", nullable = false)
    private Long cartGroupId;

    @Column(name = "sku_id", nullable = false)
    private Integer skuId;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "is_checked", nullable = false)
    private boolean checked;

    // 스캔/검색으로 담을 때만 채워짐(POST .../items). 체크박스로 수동 토글할 때는
    // 절대 안 건드림 — "매장에서 실제로 스캔한 것"과 "미리 계획만 해둔 것"을 구분하기 위함.
    // AI 소비 분석(계획 대비 실구매 비교)의 근거 데이터로 쓰임.
    @Column(name = "scanned_at")
    private LocalDateTime scannedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected CartItem() {}

    public CartItem(Long cartGroupId, Integer skuId, int quantity) {
        this(cartGroupId, skuId, quantity, true);
    }

    public CartItem(Long cartGroupId, Integer skuId, int quantity, boolean checked) {
        if (cartGroupId == null) throw new IllegalArgumentException("cartGroupId는 필수입니다.");
        this.cartGroupId = cartGroupId;
        this.skuId = skuId;
        this.quantity = quantity;
        this.checked = checked;
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() { updatedAt = LocalDateTime.now(); }

    public void increaseQuantity(int amount) { quantity += amount; }
    public void changeQuantity(int quantity) {
        if (quantity < 1) throw new IllegalArgumentException("수량은 1개 이상이어야 합니다.");
        this.quantity = quantity;
    }
    public void toggleChecked(boolean checked) { this.checked = checked; }

    /** 스캔/검색으로 담을(또는 다시 담을) 때만 호출. 체크박스 토글 경로에서는 절대 호출하지 않는다. */
    public void markScanned(LocalDateTime scannedAt) { this.scannedAt = scannedAt; }

    public Long getCartItemId() { return cartItemId; }
    public Long getCartGroupId() { return cartGroupId; }
    public Integer getSkuId() { return skuId; }
    public int getQuantity() { return quantity; }
    public boolean isChecked() { return checked; }
    public LocalDateTime getScannedAt() { return scannedAt; }
}