package com.storeflow.order.dto;

import com.storeflow.order.entity.Order;
import com.storeflow.order.entity.OrderItem;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

public class OrderResponse {

    // ⚠ 실제 PG(결제) 연동이 없어서 결제수단은 저장된 값이 아니라 가짜 데이터임.
    // orderId를 시드로 이 목록 중 하나를 "고정" 선택해서, 같은 주문을 다시 조회해도
    // 매번 값이 바뀌지 않도록 함(랜덤을 쓰면 새로고침마다 결제수단이 달라져 보여서 부자연스러움).
    private static final List<String> FAKE_PAYMENT_METHODS = List.of(
            "신용카드", "카카오페이", "네이버페이", "삼성페이", "체크카드"
    );

    private Long orderId;
    private int totalAmount;
    private String status;
    private List<ItemDto> items;
    private LocalDateTime orderedAt;
    private String paymentMethod;

    public OrderResponse(Order order) {
        this.orderId = order.getOrderId();
        this.totalAmount = order.getTotalAmount();
        this.status = order.getStatus();
        this.items = order.getOrderItems().stream()
                .map(ItemDto::new)
                .collect(Collectors.toList());
        this.orderedAt = order.getCreatedAt();
        this.paymentMethod = resolveFakePaymentMethod(order.getOrderId());
    }

    private static String resolveFakePaymentMethod(Long orderId) {
        if (orderId == null) {
            return FAKE_PAYMENT_METHODS.get(0);
        }
        int index = (int) (Math.abs(orderId) % FAKE_PAYMENT_METHODS.size());
        return FAKE_PAYMENT_METHODS.get(index);
    }

    public Long getOrderId() { return orderId; }
    public int getTotalAmount() { return totalAmount; }
    public String getStatus() { return status; }
    public List<ItemDto> getItems() { return items; }
    public LocalDateTime getOrderedAt() { return orderedAt; }
    public String getPaymentMethod() { return paymentMethod; }

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