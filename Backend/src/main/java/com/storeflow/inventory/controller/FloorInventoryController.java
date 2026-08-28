package com.storeflow.inventory.controller;

import com.storeflow.inventory.dto.LowStockLocationResponse;
import com.storeflow.inventory.service.InventoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * GET /api/floors/{floorNo}/low-stock-locations (신규, 성원님 요청)
 * Simulation 직원 NPC가 재입고할 매대를 찾을 때 쓰던 "매대 하나마다 순차 HTTP 요청"
 * 방식을 대체한다 — DB 그리드가 커지면서(층당 매대 수천 개) 그 방식이 사실상 NPC를
 * 멈춰 보이게 만들고 다른 요청(매대 클릭 등)까지 지연시켰다. 이 엔드포인트는 층 전체를
 * 서버에서 쿼리 한 번으로 훑어서 재고 부족 매대 목록만 돌려준다.
 */
@RestController
@RequestMapping("/api/floors")
public class FloorInventoryController {

    private final InventoryService inventoryService;

    public FloorInventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping("/{floorNo}/low-stock-locations")
    public ResponseEntity<List<LowStockLocationResponse>> getLowStockLocations(@PathVariable int floorNo) {
        return ResponseEntity.ok(inventoryService.getLowStockLocationsByFloor(floorNo));
    }
}
