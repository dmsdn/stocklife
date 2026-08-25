package com.storeflow.order.dto;

import com.storeflow.order.entity.Order;
import com.storeflow.order.entity.OrderItem;

import java.util.List;
import java.util.stream.Collectors;

public class OrderResponse {

    private Long orderId;
    private int originalAmount;
    private int discountAmount;
    private int totalAmount;
    private Long consumerCouponId;
    private String status;
    private List<ItemDto> items;

    public OrderResponse(Order order) {
        this.orderId = order.getOrderId();
        this.originalAmount = order.getOriginalAmount();
        this.discountAmount = order.getDiscountAmount();
        this.totalAmount = order.getTotalAmount();
        this.consumerCouponId = order.getConsumerCouponId();
        this.status = order.getStatus();
        this.items = order.getOrderItems().stream()
                .map(ItemDto::new)
                .collect(Collectors.toList());
    }

    public Long getOrderId() { return orderId; }
    public int getOriginalAmount() { return originalAmount; }
    public int getDiscountAmount() { return discountAmount; }
    public int getTotalAmount() { return totalAmount; }
    public Long getConsumerCouponId() { return consumerCouponId; }
    public String getStatus() { return status; }
    public List<ItemDto> getItems() { return items; }

    public static class ItemDto {
        private Integer skuId;
        private String productName;
        private int priceKrw;
        private int quantity;

        public ItemDto(OrderItem orderItem) {
            this.skuId = orderItem.getSkuId();
            this.productName = orderItem.getProductName();
            this.priceKrw = orderItem.getPriceKrw();
            this.quantity = orderItem.getQuantity();
        }

        public Integer getSkuId() { return skuId; }
        public String getProductName() { return productName; }
        public int getPriceKrw() { return priceKrw; }
        public int getQuantity() { return quantity; }
    }
}
