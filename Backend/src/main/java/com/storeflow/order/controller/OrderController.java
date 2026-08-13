package com.storeflow.order.controller;
import java.util.List;
import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.order.dto.OrderResponse;
import com.storeflow.order.service.OrderService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
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

}