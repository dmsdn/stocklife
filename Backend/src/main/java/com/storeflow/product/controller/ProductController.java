package com.storeflow.product.controller;

import com.storeflow.product.dto.ProductSearchResponse;
import com.storeflow.product.service.ProductSearchService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductSearchService productSearchService;

    public ProductController(ProductSearchService productSearchService) {
        this.productSearchService = productSearchService;
    }

    @GetMapping("/search")
    public ResponseEntity<List<ProductSearchResponse>> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String categoryL1,
            @RequestParam(required = false) String categoryL2,
            @RequestParam(required = false) Integer maxPrice,
            @RequestParam(name = "onPromo", required = false, defaultValue = "false") boolean onPromoOnly,
            @RequestParam(required = false) Integer recentDays) {
        return ResponseEntity.ok(productSearchService.search(
                keyword, categoryL1, categoryL2, maxPrice, onPromoOnly, recentDays));
    }

    @GetMapping("/{skuId}")
    public ResponseEntity<?> getProduct(@PathVariable Integer skuId) {
        try {
            return ResponseEntity.ok(productSearchService.getDetail(skuId));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(404).body(e.getMessage());
        }
    }
}