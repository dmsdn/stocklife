package com.storeflow.inventory.controller;

import com.storeflow.inventory.dto.InventoryItemResponse;
import com.storeflow.inventory.service.InventoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/products/{skuId}/inventory")
public class InventoryController {

    private final InventoryService inventoryService;

    public InventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping
    public ResponseEntity<?> getInventory(@PathVariable Integer skuId) {
        try {
            List<InventoryItemResponse> inventory = inventoryService.getInventory(skuId);
            return ResponseEntity.ok(inventory);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(404).body(e.getMessage());
        }
    }
}