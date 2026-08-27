package com.storeflow.product.dto;

import com.storeflow.product.entity.Product;
import com.storeflow.promotion.entity.Promotion;

/**
 * 상품 검색 공용 응답 DTO.
 * category는 기존 ai-server 호환용 alias이고 categoryL1과 같은 값이다.
 *
 * priceKrw는 항상 "정가"다. 진행 중인 행사가 있으면 finalPriceKrw에 할인 반영된 실제
 * 판매가를 함께 내려준다 — compare_products 같은 가격 비교 로직이 정가만 보고 잘못된
 * 결론을 내리지 않도록, AI가 볼 수 있는 필드에 행사 정보를 반드시 포함시킨다.
 */
public class ProductSearchResponse {
    private Integer skuId;
    private String name;
    private String category;
    private String categoryL1;
    private String categoryL2;
    private String brand;
    private int priceKrw;
    private boolean onPromo;
    private int discountKrw;
    private int finalPriceKrw;
    private String unit;
    private String specRaw;
    private String imageUrl;
    private String lifecycleStatus;
    private boolean discontinued;

    /** 행사 없는 경우(또는 행사 조회를 하지 않는 기존 호출부) 호환용. */
    public ProductSearchResponse(Product product) {
        this(product, null);
    }

    public ProductSearchResponse(Product product, Promotion activePromotion) {
        this.skuId = product.getSkuId();
        this.name = product.getName();
        this.category = product.getCategoryL1();
        this.categoryL1 = product.getCategoryL1();
        this.categoryL2 = product.getCategoryL2();
        this.brand = product.getBrand();
        this.priceKrw = product.getPriceKrw();
        this.unit = product.getUnit();
        this.specRaw = product.getSpecRaw();
        this.imageUrl = product.getImageUrl();
        this.lifecycleStatus = product.getLifecycleStatus().name();
        this.discontinued = product.getLifecycleStatus() == Product.LifecycleStatus.DISCONTINUED;

        if (activePromotion != null) {
            this.onPromo = true;
            this.discountKrw = activePromotion.getDiscountKrw();
            this.finalPriceKrw = Math.max(0, this.priceKrw - this.discountKrw);
        } else {
            this.onPromo = false;
            this.discountKrw = 0;
            this.finalPriceKrw = this.priceKrw;
        }
    }

    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public String getCategory() { return category; }
    public String getCategoryL1() { return categoryL1; }
    public String getCategoryL2() { return categoryL2; }
    public String getBrand() { return brand; }
    public int getPriceKrw() { return priceKrw; }
    public boolean isOnPromo() { return onPromo; }
    public int getDiscountKrw() { return discountKrw; }
    public int getFinalPriceKrw() { return finalPriceKrw; }
    public String getUnit() { return unit; }
    public String getSpecRaw() { return specRaw; }
    public String getImageUrl() { return imageUrl; }
    public String getLifecycleStatus() { return lifecycleStatus; }
    public boolean isDiscontinued() { return discontinued; }
}