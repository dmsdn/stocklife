package com.storeflow.inventory.controller;

import com.storeflow.inventory.dto.InventoryItemResponse;
import com.storeflow.inventory.service.InventoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * GET /api/products/inventory?skuIds=1,2,3 (신규, 박은우님 요청) — 여러 상품의 재고를
 * 한 번에 조회. 기존 /api/products/{skuId}/inventory(단건)와 별도 컨트롤러로 둔 이유는
 * 경로 패턴이 겹치면(둘 다 /api/products/... 트리) 스프링이 라우팅을 모호하게 해석할
 * 수 있어서다 — /api/products/inventory 는 skuId 경로변수가 없는 고정 경로.
 */
@RestController
@RequestMapping("/api/products")
public class InventoryBatchController {

    private final InventoryService inventoryService;

    public InventoryBatchController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping("/inventory")
    public ResponseEntity<Map<Integer, List<InventoryItemResponse>>> getInventoryBatch(
            @RequestParam List<Integer> skuIds) {
        return ResponseEntity.ok(inventoryService.getInventoryBatch(skuIds));
    }
}
