package com.storeflow.inventory.controller;

import com.storeflow.inventory.dto.ChangeEventResponse;
import com.storeflow.inventory.service.InventoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/inventory/change-events")
public class ChangeEventController {

    private final InventoryService inventoryService;

    public ChangeEventController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping
    public ResponseEntity<?> getChangeEvents(@RequestParam List<Integer> skuIds,
                                             @RequestParam(defaultValue = "24") int hours) {
        try {
            List<ChangeEventResponse> events = inventoryService.getChangeEvents(skuIds, hours);
            return ResponseEntity.ok(events);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}