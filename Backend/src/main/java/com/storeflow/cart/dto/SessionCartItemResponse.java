package com.storeflow.cart.dto;

import com.storeflow.cart.entity.CartItem;
import com.storeflow.product.entity.Product;

public class SessionCartItemResponse {
    private Integer skuId;
    private String productName;
    private int priceKrw;
    private int quantity;
    private boolean checked;
    private int subtotal;

    public SessionCartItemResponse(CartItem item, Product product, int subtotal) {
        this.skuId = item.getSkuId();
        this.productName = product.getName();
        this.priceKrw = product.getPriceKrw();
        this.quantity = item.getQuantity();
        this.checked = item.isChecked();
        this.subtotal = subtotal;
    }

    public Integer getSkuId() { return skuId; }
    public String getProductName() { return productName; }
    public int getPriceKrw() { return priceKrw; }
    public int getQuantity() { return quantity; }
    public boolean isChecked() { return checked; }
    public int getSubtotal() { return subtotal; }
}