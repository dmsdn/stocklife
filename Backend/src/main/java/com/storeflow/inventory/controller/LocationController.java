package com.storeflow.inventory.controller;

import com.storeflow.inventory.dto.LocationProductResponse;
import com.storeflow.inventory.service.InventoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Simulation 프론트(2D 매장 시뮬레이터)가 매대를 클릭했을 때 그 안에 어떤 상품이
 * 진열돼 있는지 보여주는 팝업용 API. /api/products/{skuId}/inventory(상품→위치)의
 * 반대 방향(위치→상품)이다.
 */
@RestController
@RequestMapping("/api/locations")
public class LocationController {

    private final InventoryService inventoryService;

    public LocationController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping("/{locationId}/products")
    public ResponseEntity<List<LocationProductResponse>> getProductsAtLocation(@PathVariable String locationId) {
        return ResponseEntity.ok(inventoryService.getProductsAtLocation(locationId));
    }
}
