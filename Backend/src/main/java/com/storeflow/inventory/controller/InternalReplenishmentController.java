package com.storeflow.inventory.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.inventory.dto.PendingReplenishmentResponse;
import com.storeflow.inventory.service.InventoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Agent 서버 전용 내부 엔드포인트. InternalOrderController와 동일한 패턴이다.
 * 가용예측 모델이 "지금 par 밑이라 대기 중인 매대 큐"를 조회할 때 쓴다.
 * 프론트는 절대 이 경로를 직접 호출하면 안 된다.
 */
@RestController
@RequestMapping("/internal/replenishment")
public class InternalReplenishmentController {

    private final InventoryService inventoryService;
    private final InternalServiceAuth internalServiceAuth;

    public InternalReplenishmentController(InventoryService inventoryService,
                                            InternalServiceAuth internalServiceAuth) {
        this.inventoryService = inventoryService;
        this.internalServiceAuth = internalServiceAuth;
    }

    @GetMapping("/pending")
    public ResponseEntity<?> getPendingReplenishments(
            @RequestHeader("X-Internal-Service-Key") String key) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        List<PendingReplenishmentResponse> result = inventoryService.getPendingReplenishments();
        return ResponseEntity.ok(result); // 큐가 없어도 200 [] — 404와 절대 혼동하면 안 됨
    }
}