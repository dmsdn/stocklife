package com.storeflow.product.entity;

import jakarta.persistence.*;

/**
 * ★ 스키마 정합 메모 (2026-08-14 요구사항 정의서 반영)
 * schema_v2.sql의 products 테이블에는 category_l1/category_l2, unit, spec_raw,
 * image_url, lifecycle_status 등이 정의돼 있지만, 이 엔티티는 기존 체크아웃/장바구니
 * 로직(stockQuantity, active, decreaseStock)을 깨지 않기 위해 "추가"만 했다.
 *
 * - category(기존 컬럼) = category_l1 취급 (컬럼명은 그대로 두고 DTO에서 categoryL1으로 노출)
 * - categoryL2 / unit / specRaw / imageUrl은 신규 nullable 컬럼 (없어도 기존 기능 안 깨짐)
 * - lifecycle_status는 별도 컬럼을 추가하지 않고 기존 active 플래그에서 파생시켜 DTO에서 노출한다
 *   (ACTIVE/DISCONTINUED 두 값만 필요하고, active와 의미가 1:1로 겹치기 때문에 컬럼 이중관리를 피함)
 *
 * 재고 위치(zones/racks/locations) 기반의 "진짜" schema_v2 재고 모델로의 전환은
 * 더 큰 마이그레이션이 필요해서 이번 변경 범위에 넣지 않았다 (요구사항 정의서 1절 시드 항목).
 */
@Entity
@Table(name = "products")
public class Product {

    @Id
    @Column(name = "sku_id")
    private Integer skuId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "price_krw", nullable = false)
    private int priceKrw;

    @Column(name = "stock_quantity", nullable = false)
    private int stockQuantity;

    @Column(name = "active")
    private boolean active;

    @Column(name = "category", nullable = false)
    private String category; // = category_l1

    @Column(name = "brand")
    private String brand;

    // ---- 아래부터 신규 추가 (nullable, 기존 로직에 영향 없음) ----

    @Column(name = "category_l2")
    private String categoryL2;

    @Column(name = "unit")
    private String unit;

    @Column(name = "spec_raw")
    private String specRaw;

    @Column(name = "image_url")
    private String imageUrl;

    protected Product() {}

    public void decreaseStock(int quantity) {
        if (this.stockQuantity < quantity) {
            throw new IllegalStateException("[" + name + "] 재고가 부족합니다. (남은 수량: " + stockQuantity + ")");
        }
        this.stockQuantity -= quantity;
    }

    public String getCategory() { return category; }
    public String getBrand() { return brand; }
    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public int getPriceKrw() { return priceKrw; }
    public int getStockQuantity() { return stockQuantity; }
    public boolean isActive() { return active; }
    public String getCategoryL2() { return categoryL2; }
    public String getUnit() { return unit; }
    public String getSpecRaw() { return specRaw; }
    public String getImageUrl() { return imageUrl; }
}