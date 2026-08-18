package com.storeflow.product.entity;

import jakarta.persistence.*;

import java.time.LocalDate;

/**
 * schema_v2.sql의 products 테이블과 1:1로 맞춘 상품 엔티티.
 * 재고는 products가 아니라 stocks 테이블에서 관리하므로 이 엔티티가 재고를 직접 차감하지 않는다.
 */
@Entity
@Table(name = "products")
public class Product {

    @Id
    @Column(name = "sku_id")
    private Integer skuId;

    @Column(name = "barcode", nullable = false)
    private String barcode;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "brand", nullable = false)
    private String brand;

    @Column(name = "is_pb", nullable = false)
    private boolean pb;

    @Column(name = "category_l1", nullable = false)
    private String categoryL1;

    @Column(name = "category_l2", nullable = false)
    private String categoryL2;

    @Column(name = "is_refrigerated", nullable = false)
    private boolean refrigerated;

    @Column(name = "is_frozen", nullable = false)
    private boolean frozen;

    @Column(name = "is_alcohol", nullable = false)
    private boolean alcohol;

    @Column(name = "is_fresh", nullable = false)
    private boolean fresh;

    @Column(name = "unit", nullable = false)
    private String unit;

    @Column(name = "price_krw", nullable = false)
    private int priceKrw;

    // MySQL JSON 컬럼은 현재 문자열 원문으로 읽는다.
    @Column(name = "spec", nullable = false, columnDefinition = "json")
    private String spec;

    @Column(name = "spec_raw", nullable = false)
    private String specRaw;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "first_stocked_at", nullable = false)
    private LocalDate firstStockedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "lifecycle_status", nullable = false)
    private LifecycleStatus lifecycleStatus;

    public enum LifecycleStatus {
        ACTIVE,
        DISCONTINUED
    }

    protected Product() {
    }

    public Integer getSkuId() { return skuId; }
    public String getBarcode() { return barcode; }
    public String getName() { return name; }
    public String getBrand() { return brand; }
    public boolean isPb() { return pb; }
    public String getCategoryL1() { return categoryL1; }
    public String getCategoryL2() { return categoryL2; }
    public boolean isRefrigerated() { return refrigerated; }
    public boolean isFrozen() { return frozen; }
    public boolean isAlcohol() { return alcohol; }
    public boolean isFresh() { return fresh; }
    public String getUnit() { return unit; }
    public int getPriceKrw() { return priceKrw; }
    public String getSpec() { return spec; }
    public String getSpecRaw() { return specRaw; }
    public String getImageUrl() { return imageUrl; }
    public LocalDate getFirstStockedAt() { return firstStockedAt; }
    public LifecycleStatus getLifecycleStatus() { return lifecycleStatus; }
    public boolean isActive() { return lifecycleStatus == LifecycleStatus.ACTIVE; }
}
