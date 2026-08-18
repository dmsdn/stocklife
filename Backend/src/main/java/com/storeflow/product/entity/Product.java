package com.storeflow.product.entity;

import jakarta.persistence.*;
import java.time.LocalDate;

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

    @Column(name = "stock_quantity", nullable = false)
    private int stockQuantity;

    // JSON 컬럼. 우선 문자열로 받아둠 — 파싱해서 쓸 일이 생기면 그때 타입 바꾸면 됨.
    @Column(name = "spec", nullable = false, columnDefinition = "json")
    private String spec;

    @Column(name = "spec_raw", nullable = false)
    private String specRaw;

    @Column(name = "active")
    private boolean active;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "first_stocked_at", nullable = false)
    private LocalDate firstStockedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "lifecycle_status", nullable = false)
    private LifecycleStatus lifecycleStatus;

    public enum LifecycleStatus { ACTIVE, DISCONTINUED }

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

    // 주의: 재고 관련 필드·decreaseStock() 메서드를 여기서 뺐음.
    // 재고는 이제 stocks 테이블(위치별)에 있고, "재고를 바꾸는 문은 하나"(16번 재고 갱신 API)
    // 원칙 때문에 Product 엔티티가 직접 재고를 깎으면 안 됨. OrderService 쪽 대응은 아래 참고.

    public String getCategory() { return category; }
    public String getBrand() { return brand; }
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
    public int getStockQuantity() { return stockQuantity; }
    public boolean isActive() { return active; }
    public String getCategoryL2() { return categoryL2; }
    public String getUnit() { return unit; }
    public String getSpecRaw() { return specRaw; }
    public String getImageUrl() { return imageUrl; }
    public String getSpec() { return spec; }
    public String getSpecRaw() { return specRaw; }
    public String getImageUrl() { return imageUrl; }
    public LocalDate getFirstStockedAt() { return firstStockedAt; }
    public LifecycleStatus getLifecycleStatus() { return lifecycleStatus; }
    public boolean isActive() { return lifecycleStatus == LifecycleStatus.ACTIVE; }
}