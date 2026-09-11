package com.storeflow.inventory.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.inventory.dto.PendingReplenishmentResponse;
import com.storeflow.inventory.dto.WorldHealthResponse;
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

    /**
     * 위 pending 의 빈 배열을 어떻게 읽어야 하는지 알려준다 (09-10 신설).
     *
     * [왜 따로 냈나] pending 이 200 [] 를 주는 것 자체는 옳다. "채울 게 없다"는 정상
     * 상태이지 에러가 아니기 때문이다. 문제는 그 빈 배열에 **"정말 0건"과 "세계 데이터가
     * 안 실려서 0건"이 구분 없이 섞여 있다**는 것이다. 받는 쪽은 둘을 가릴 수 없어서
     * 데이터 결손을 "매장이 한산하다"로 읽고 잘못된 보충 확률을 냈다.
     *
     * pending 의 응답 형태를 바꾸면 이미 그것을 읽고 있는 Agent 가 깨지므로, 판단 근거만
     * 옆 창구로 따로 낸다. 부르는 쪽은 seeded 가 false 일 때 빈 큐를 "모름"으로 읽으면
     * 되고, 이 창구를 안 써도 지금과 똑같이 동작한다.
     *
     * 이 값이 있으면 시연 전에 backend_probe.py 를 사람이 손으로 돌려 확인하던 절차를
     * 호출 한 번으로 대신할 수 있다.
     */
    @GetMapping("/health")
    public ResponseEntity<?> getWorldHealth(
            @RequestHeader("X-Internal-Service-Key") String key) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        WorldHealthResponse result = inventoryService.getWorldHealth();
        return ResponseEntity.ok(result); // 세계가 비어 있어도 200 — 비었다는 사실 자체가 답이다
    }
}