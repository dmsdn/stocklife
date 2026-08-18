package com.storeflow.product.controller;

import com.storeflow.product.dto.ProductSearchResponse;
import com.storeflow.product.service.ProductSearchService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductSearchService productSearchService;

    public ProductController(ProductSearchService productSearchService) {
        this.productSearchService = productSearchService;
    }

    @GetMapping("/search")
    public ResponseEntity<List<ProductSearchResponse>> search(@RequestParam String keyword) {
        return ResponseEntity.ok(productSearchService.search(keyword));
    }
}