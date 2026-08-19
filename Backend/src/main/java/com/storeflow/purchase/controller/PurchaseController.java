package com.storeflow.purchase.controller;

import com.storeflow.global.security.CurrentConsumer;
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
}