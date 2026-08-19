package com.storeflow.purchase.controller;

import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.purchase.dto.CategoryPreferenceResponse;
import com.storeflow.purchase.dto.ProductPopularityResponse;
import com.storeflow.purchase.dto.PurchaseHistoryResponse;
import com.storeflow.purchase.service.PurchaseService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/purchases")
public class PurchaseController {

    private final PurchaseService purchaseService;

    public PurchaseController(PurchaseService purchaseService) {
        this.purchaseService = purchaseService;
    }

    @GetMapping
    public ResponseEntity<List<PurchaseHistoryResponse>> getPurchaseHistory(@CurrentConsumer Long consumerId) {
        return ResponseEntity.ok(purchaseService.getPurchaseHistory(consumerId));
    }

    /**
     * "A샴푸보다 B샴푸가 더 잘 나가나?" 같은 질문용. 예: /api/purchases/compare?skuIds=101,102
     * 응답은 개인 구매내역이 아니라 전 회원 합계/구매자 수라 로그인 없이도 열어도 되지만,
     * 우선 다른 조회 API들과 통일성 있게 인증 사용자만 쓰도록 맞춰뒀다.
     */
    @GetMapping("/compare")
    public ResponseEntity<List<ProductPopularityResponse>> compareProducts(
            @CurrentConsumer Long consumerId,
            @RequestParam List<Integer> skuIds,
            @RequestParam(required = false) Integer lookbackDays) {
        return ResponseEntity.ok(purchaseService.compareProducts(skuIds, lookbackDays));
    }

    /**
     * "다른 사람들은 보통 뭘 사?" 같은 질문용. 예: /api/purchases/popular?categoryL2=샴푸&limit=5
     */
    @GetMapping("/popular")
    public ResponseEntity<List<ProductPopularityResponse>> getPopularProducts(
            @CurrentConsumer Long consumerId,
            @RequestParam(required = false) String categoryL2,
            @RequestParam(required = false) Integer lookbackDays,
            @RequestParam(required = false) Integer limit) {
        return ResponseEntity.ok(purchaseService.getPopularProducts(categoryL2, lookbackDays, limit));
    }

    /**
     * 취향 추천용 — 이 회원이 최근 많이 산 카테고리 랭킹. 예: /api/purchases/top-categories?limit=3
     * "청소용품을 많이 샀으면 새로 들어온/할인하는 청소용품 추천" 흐름의 1단계.
     * 실제 추천 상품(신상/행사)은 이 결과의 categoryL2로 /api/products/search를 다시 불러 채운다.
     */
    @GetMapping("/top-categories")
    public ResponseEntity<List<CategoryPreferenceResponse>> getTopCategories(
            @CurrentConsumer Long consumerId,
            @RequestParam(required = false) Integer lookbackDays,
            @RequestParam(required = false) Integer limit) {
        return ResponseEntity.ok(purchaseService.getTopCategories(consumerId, lookbackDays, limit));
    }
}