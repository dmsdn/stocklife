package com.storeflow.inventory.entity;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.Objects;

@Entity
@Table(name = "stocks")
@IdClass(Stock.StockId.class)
public class Stock {

    @Id
    @Column(name = "sku_id")
    private Integer skuId;

    @Id
    @Column(name = "location_id")
    private String locationId;

    @Column(name = "qty", nullable = false)
    private int qty;

    protected Stock() {}
        public Stock(Integer skuId, String locationId, int qty) {
        this.skuId = skuId;
        this.locationId = locationId;
        this.qty = qty;
    }

    public Integer getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public int getQty() { return qty; }
    public void setQty(int qty) { this.qty = qty; }

    public static class StockId implements Serializable {
        private Integer skuId;
        private String locationId;

        public StockId() {}
        public StockId(Integer skuId, String locationId) {
            this.skuId = skuId;
            this.locationId = locationId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof StockId that)) return false;
            return Objects.equals(skuId, that.skuId) && Objects.equals(locationId, that.locationId);
        }

        @Override
        public int hashCode() { return Objects.hash(skuId, locationId); }
    }
}