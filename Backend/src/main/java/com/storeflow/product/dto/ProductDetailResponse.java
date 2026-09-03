package com.storeflow.product.dto;

import com.storeflow.product.entity.Product;
import com.storeflow.promotion.entity.Promotion;

public class ProductDetailResponse {
    private Integer skuId;
    private String name;
    private String brand;
    private String categoryL1;
    private String categoryL2;
    private int priceKrw;
    private boolean onPromo;
    private int discountKrw;
    private int finalPriceKrw;
    private String unit;
    private String specRaw;   // 규격 원문 (예: "9,000ml (1.5L × 6입)")
    private String spec;      // 규격 JSON 원문
    private String imageUrl;
    private boolean discontinued; // true면 단종 — "그 커피 어디 갔어요?" 같은 질문에 응답용
    // ⚠ 09-02 시연 점검: 스캔 = "그 매대 앞에 서 있다"는 가장 확실한 위치 증거인데,
    //   바코드 응답에 위치가 없어 프론트가 SCAN_ADD 에 locationId 를 채울 수 없었다.
    //   PICK(집는 매대) 자리 하나를 실어 보낸다. 없으면 null — 없는 값을 지어내지 않는다.
    private String pickLocationId;
    private Integer pickFloorNo;

    public ProductDetailResponse(Product product) {
        this(product, null);
    }

    public ProductDetailResponse(Product product, Promotion activePromotion) {
        this.skuId = product.getSkuId();
        this.name = product.getName();
        this.brand = product.getBrand();
        this.categoryL1 = product.getCategoryL1();
        this.categoryL2 = product.getCategoryL2();
        this.priceKrw = product.getPriceKrw();
        this.unit = product.getUnit();
        this.specRaw = product.getSpecRaw();
        this.spec = product.getSpec();
        this.imageUrl = product.getImageUrl();
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
    public String getPickLocationId() { return pickLocationId; }
    public Integer getPickFloorNo() { return pickFloorNo; }
    public void setPickLocation(String locationId, Integer floorNo) {
        this.pickLocationId = locationId;
        this.pickFloorNo = floorNo;
    }
    public String getName() { return name; }
    public String getBrand() { return brand; }
    public String getCategoryL1() { return categoryL1; }
    public String getCategoryL2() { return categoryL2; }
    public int getPriceKrw() { return priceKrw; }
    public boolean isOnPromo() { return onPromo; }
    public int getDiscountKrw() { return discountKrw; }
    public int getFinalPriceKrw() { return finalPriceKrw; }
    public String getUnit() { return unit; }
    public String getSpecRaw() { return specRaw; }
    public String getSpec() { return spec; }
    public String getImageUrl() { return imageUrl; }
    public boolean isDiscontinued() { return discontinued; }
}