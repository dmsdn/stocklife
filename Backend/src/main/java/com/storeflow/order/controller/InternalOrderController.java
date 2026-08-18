package com.storeflow.order.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.order.dto.FrequentPurchaseResponse;
import com.storeflow.order.service.OrderService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Agent 서버(ai-server) 전용 내부 엔드포인트. InternalCartController와 동일한 패턴이다.
 * Backend가 Agent를 서버 대 서버로 호출하는 경로(agent_chat.py)에서는 사용자 JWT가 없으므로
 * consumerId를 직접 받고, X-Internal-Service-Key 헤더로 인증한다.
 * 로직은 공개 /api/orders/frequent와 동일한 OrderService.getFrequentPurchases()를 재사용한다.
 *
 * 프론트는 절대 이 경로를 직접 호출하면 안 된다.
 */
@RestController
@RequestMapping("/internal/orders")
public class InternalOrderController {

    private final OrderService orderService;
    private final InternalServiceAuth internalServiceAuth;

    public InternalOrderController(OrderService orderService, InternalServiceAuth internalServiceAuth) {
        this.orderService = orderService;
        this.internalServiceAuth = internalServiceAuth;
    }

    @GetMapping("/frequent")
    public ResponseEntity<?> getFrequentPurchases(
            @RequestHeader("X-Internal-Service-Key") String key,
            @RequestParam Long consumerId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long minCount) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        List<FrequentPurchaseResponse> result = orderService.getFrequentPurchases(consumerId, keyword, minCount);
        return ResponseEntity.ok(result);
    }
}