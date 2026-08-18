package com.storeflow.inventory.entity;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.Objects;

@Entity
@Table(name = "shelf_configs")
@IdClass(ShelfConfig.ShelfConfigId.class)
public class ShelfConfig {

    @Id
    @Column(name = "sku_id")
    private Integer skuId;

    @Id
    @Column(name = "location_id")
    private String locationId;

    @Column(name = "min_qty", nullable = false)
    private int minQty;

    @Column(name = "replenish_to_qty", nullable = false)
    private int replenishToQty;

    @Column(name = "capacity_qty", nullable = false)
    private int capacityQty;

    protected ShelfConfig() {}

    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public int getMinQty() { return minQty; }
    public int getReplenishToQty() { return replenishToQty; }
    public int getCapacityQty() { return capacityQty; }

    public static class ShelfConfigId implements Serializable {
        private Integer skuId;
        private String locationId;

        public ShelfConfigId() {}
        public ShelfConfigId(Integer skuId, String locationId) {
            this.skuId = skuId;
            this.locationId = locationId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof ShelfConfigId that)) return false;
            return Objects.equals(skuId, that.skuId) && Objects.equals(locationId, that.locationId);
        }

        @Override
        public int hashCode() { return Objects.hash(skuId, locationId); }
    }
}