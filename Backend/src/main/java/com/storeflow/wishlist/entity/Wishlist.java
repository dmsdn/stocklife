package com.storeflow.wishlist.entity;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "wishlists")
@IdClass(Wishlist.WishlistId.class)
public class Wishlist {

    @Id
    @Column(name = "member_id")
    private Integer memberId;

    @Id
    @Column(name = "sku_id")
    private Integer skuId;

    @Column(name = "added_at", nullable = false)
    private Instant addedAt;

    protected Wishlist() {}

    public Wishlist(Integer memberId, Integer skuId, Instant addedAt) {
        this.memberId = memberId;
        this.skuId = skuId;
        this.addedAt = addedAt;
    }

    public Integer getMemberId() { return memberId; }
    public Integer getSkuId() { return skuId; }
    public Instant getAddedAt() { return addedAt; }

    public static class WishlistId implements Serializable {
        private Integer memberId;
        private Integer skuId;

        public WishlistId() {}
        public WishlistId(Integer memberId, Integer skuId) {
            this.memberId = memberId;
            this.skuId = skuId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof WishlistId that)) return false;
            return Objects.equals(memberId, that.memberId) && Objects.equals(skuId, that.skuId);
        }

        @Override
        public int hashCode() { return Objects.hash(memberId, skuId); }
    }
}