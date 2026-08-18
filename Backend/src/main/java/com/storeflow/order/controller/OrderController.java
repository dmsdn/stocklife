package com.storeflow.order.controller;

import java.util.List;
import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.order.dto.FrequentPurchaseResponse;
import com.storeflow.order.dto.OrderResponse;
import com.storeflow.order.service.OrderService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping("/checkout")
    public ResponseEntity<OrderResponse> checkout(@CurrentConsumer Long consumerId) {
        OrderResponse response = orderService.checkout(consumerId);
        return ResponseEntity.status(201).body(response);
    }

    @GetMapping
    public ResponseEntity<List<OrderResponse>> getMyOrders(@CurrentConsumer Long consumerId) {
        return ResponseEntity.ok(orderService.getMyOrders(consumerId));
    }

    @GetMapping("/{orderId}")
    public ResponseEntity<OrderResponse> getOrderDetail(@CurrentConsumer Long consumerId,
                                                        @PathVariable Long orderId) {
        return ResponseEntity.ok(orderService.getOrderDetail(consumerId, orderId));
    }

    /**
     * "내가 항상 구매하는 휴지 장바구니에 담아줘" 같은 요청을 위한 반복 구매 조회.
     * 프론트가 사용자 JWT로 직접 호출하는 공개 엔드포인트다.
     * (Agent 서버가 서버 대 서버로 호출하는 경우는 InternalOrderController의
     *  /internal/orders/frequent 를 대신 사용한다 — 거긴 JWT가 없기 때문)
     *
     * 예: GET /api/orders/frequent?keyword=휴지&minCount=2
     */
    @GetMapping("/frequent")
    public ResponseEntity<List<FrequentPurchaseResponse>> getFrequentPurchases(
            @CurrentConsumer Long consumerId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long minCount) {
        return ResponseEntity.ok(orderService.getFrequentPurchases(consumerId, keyword, minCount));
    }
}