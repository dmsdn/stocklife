package com.storeflow.inventory.dto;

/**
 * GET /api/locations/{locationId}/products 응답 한 행 — 그 매대에 실제로 재고가 있는 상품.
 * (Simulation 프론트의 스페이스바 상품 팝업이 쓰는 것과 같은 필드 이름으로 맞췄다: skuId/name/price/stock.)
 */
public class LocationProductResponse {
    private final Integer skuId;
    private final String name;
    private final int price;
    private final int stock;

    public LocationProductResponse(Integer skuId, String name, int price, int stock) {
        this.skuId = skuId;
        this.name = name;
        this.price = price;
        this.stock = stock;
    }

    public Integer getSkuId() { return skuId; }
    public String getName() { return name; }
    public int getPrice() { return price; }
    public int getStock() { return stock; }
}
