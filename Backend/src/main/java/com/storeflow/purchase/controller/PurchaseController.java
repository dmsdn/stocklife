package com.storeflow.purchase.controller;

import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.purchase.dto.PurchaseHistoryResponse;
import com.storeflow.purchase.service.PurchaseService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
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
}