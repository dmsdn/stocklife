package com.storeflow.inventory.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.inventory.entity.ConsumerEvent;
import com.storeflow.inventory.entity.ShelfEvent;
import com.storeflow.inventory.service.ConsumerEventService;
import com.storeflow.inventory.service.InventoryService;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Agent(시뮬레이터/작업 파이프라인) 전용 내부 엔드포인트.
 * /internal/events/shelf  : 8종 shelf_event 기록 — 실제 재고 수량을 바꾸는 문은 InventoryService뿐.
 * /internal/events/consumer : 6종 consumer_event 기록 — memberId를 직접 받는다(JWT가 없는 서버 대 서버 호출이므로).
 */
@RestController
@RequestMapping("/internal/events")
public class InternalEventController {

    private final InventoryService inventoryService;
    private final ConsumerEventService consumerEventService;
    private final InternalServiceAuth internalServiceAuth;

    public InternalEventController(InventoryService inventoryService,
                                    ConsumerEventService consumerEventService,
                                    InternalServiceAuth internalServiceAuth) {
        this.inventoryService = inventoryService;
        this.consumerEventService = consumerEventService;
        this.internalServiceAuth = internalServiceAuth;
    }

    @PostMapping("/shelf")
    public ResponseEntity<?> recordShelfEvent(@RequestHeader("X-Internal-Service-Key") String key,
                                               @RequestBody ShelfEventRequest request) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        try {
            switch (request.eventType) {
                case SALE -> inventoryService.applyChange(
                        request.skuId, request.locationId, -Math.abs(request.qty), ShelfEvent.EventType.SALE, request.taskId);
                case RESTOCK_IN -> inventoryService.applyChange(
                        request.skuId, request.locationId, Math.abs(request.qty), ShelfEvent.EventType.RESTOCK_IN, request.taskId);
                case MOVE -> inventoryService.move(
                        request.skuId, request.locationId, request.toLocationId, request.taskId);
                case ITEM_CONFIRMED, TASK_QUEUED, TASK_STARTED -> inventoryService.recordTaskStatus(
                        request.eventType, request.skuId, request.locationId, request.taskId);
                default -> {
                    return ResponseEntity.badRequest().body("이 엔드포인트로 기록할 수 없는 eventType입니다: " + request.eventType);
                }
            }
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(e.getMessage());
        }

        return ResponseEntity.status(201).build();
    }

    @PostMapping("/consumer")
    public ResponseEntity<?> recordConsumerEvent(@RequestHeader("X-Internal-Service-Key") String key,
                                                  @RequestBody InternalConsumerEventRequest request) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        try {
            consumerEventService.record(request.eventType, request.sessionId, request.memberId,
                    request.skuId, request.locationId, request.payload);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }

        return ResponseEntity.status(201).build();
    }

    public static class ShelfEventRequest {
        @NotNull public ShelfEvent.EventType eventType;
        @NotNull public Integer skuId;
        @NotNull public String locationId;
        public String toLocationId; // MOVE일 때만 사용 (목적지)
        public Integer qty;         // SALE/RESTOCK_IN일 때만 사용
        public String taskId;
    }

    public static class InternalConsumerEventRequest {
        @NotNull public ConsumerEvent.EventType eventType;
        @NotNull public String sessionId;
        public Integer memberId; // 여기선 JWT가 없으니 Agent가 직접 계산해서 넘겨줌
        public Integer skuId;
        public String locationId;
        public String payload;
    }
}