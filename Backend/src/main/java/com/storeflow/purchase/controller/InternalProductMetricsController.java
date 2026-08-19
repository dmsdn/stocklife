package com.storeflow.purchase.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.purchase.dto.ProductMetricsResponse;
import com.storeflow.purchase.service.ProductMetricsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Agent 전용 상품 반응 지표 API.
 * 최근 30일 판매량/행동수, 누적 판매량, 재구매율을 Backend가 계산해 숫자로 반환한다.
 * 웹 평판은 외부 웹 정보이므로 이 API에 포함하지 않는다(Agent가 별도 웹 검색).
 */
@RestController
@RequestMapping("/internal/products")
public class InternalProductMetricsController {

    private final ProductMetricsService productMetricsService;
    private final InternalServiceAuth internalServiceAuth;

    public InternalProductMetricsController(ProductMetricsService productMetricsService,
                                            InternalServiceAuth internalServiceAuth) {
        this.productMetricsService = productMetricsService;
        this.internalServiceAuth = internalServiceAuth;
    }

    @GetMapping("/metrics")
    public ResponseEntity<?> getMetrics(
            @RequestHeader("X-Internal-Service-Key") String key,
            @RequestParam List<Integer> skuIds) {
        try {
            internalServiceAuth.verify(key);
            List<ProductMetricsResponse> result = productMetricsService.getMetrics(skuIds);
            return ResponseEntity.ok(result);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
