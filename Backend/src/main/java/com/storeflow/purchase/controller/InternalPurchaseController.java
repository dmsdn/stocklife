package com.storeflow.purchase.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.purchase.dto.CategoryPreferenceResponse;
import com.storeflow.purchase.dto.ProductPopularityResponse;
import com.storeflow.purchase.service.PurchaseService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Agent 서버(ai-server) 전용 내부 엔드포인트. InternalOrderController/InternalCartController와
 * 동일한 패턴이다. Backend가 Agent를 서버 대 서버로 호출하는 경로(agent_chat.py)에서는
 * 사용자 JWT가 없으므로 consumerId를 직접 받고, X-Internal-Service-Key 헤더로 인증한다.
 * 로직은 공개 /api/purchases/top-categories와 동일한 PurchaseService.getTopCategories()를 재사용한다.
 *
 * 프론트는 절대 이 경로를 직접 호출하면 안 된다.
 */
@RestController
@RequestMapping("/internal/purchases")
public class InternalPurchaseController {

    private final PurchaseService purchaseService;
    private final InternalServiceAuth internalServiceAuth;

    public InternalPurchaseController(PurchaseService purchaseService, InternalServiceAuth internalServiceAuth) {
        this.purchaseService = purchaseService;
        this.internalServiceAuth = internalServiceAuth;
    }

    @GetMapping("/top-categories")
    public ResponseEntity<?> getTopCategories(
            @RequestHeader("X-Internal-Service-Key") String key,
            @RequestParam Long consumerId,
            @RequestParam(required = false) Integer lookbackDays,
            @RequestParam(required = false) Integer limit) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        List<CategoryPreferenceResponse> result = purchaseService.getTopCategories(consumerId, lookbackDays, limit);
        return ResponseEntity.ok(result);
    }
    /**
     * 능동 개입 Agent(SSE watcher)용 전체 판매 비교. 사용자 JWT 없이 내부 서비스 키로만 호출한다.
     */
    @GetMapping("/compare")
    public ResponseEntity<?> compareProducts(
            @RequestHeader("X-Internal-Service-Key") String key,
            @RequestParam List<Integer> skuIds,
            @RequestParam(required = false) Integer lookbackDays) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }
        List<ProductPopularityResponse> result = purchaseService.compareProducts(skuIds, lookbackDays);
        return ResponseEntity.ok(result);
    }

        /**
     * "요즘 뭐가 잘 나가요?" — 카테고리(선택) 안에서 최근 인기 상품 상위 N개.
     * 공개 /api/purchases/popular가 JWT를 요구해서, 서버 대 서버 호출(사용자 토큰 없음)
     * 경로로는 이 내부 엔드포인트를 대신 쓴다. 응답 형태는 /compare와 동일(ProductPopularityResponse).
     */
    @GetMapping("/popular")
    public ResponseEntity<?> getPopularProducts(
            @RequestHeader("X-Internal-Service-Key") String key,
            @RequestParam(required = false) String categoryL2,
            @RequestParam(required = false) Integer lookbackDays,
            @RequestParam(required = false) Integer limit) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        List<ProductPopularityResponse> result =
                purchaseService.getPopularProducts(categoryL2, lookbackDays, limit);
        return ResponseEntity.ok(result);
    }

}