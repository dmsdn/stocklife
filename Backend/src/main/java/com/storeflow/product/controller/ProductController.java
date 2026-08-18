package com.storeflow.product.controller;

import com.storeflow.product.dto.AlternativesResponse;
import com.storeflow.product.dto.ProductSearchResponse;
import com.storeflow.product.service.ProductSearchService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 상품 검색/조회는 개인정보가 아니라 매장 공개 정보이므로, 이 컨트롤러는 인증 없이
 * 공개 API로 둔다 (쇼핑몰 검색창과 Agent가 같은 엔드포인트를 쓴다 — 요구사항 정의서 8번).
 * 쓰기(등록/수정/비활성화)는 이 컨트롤러에 없다 — 재고를 바꾸는 문은 따로 하나만 둔다는
 * 원칙에 따라, 상품 데이터 변경은 관리 도구/시더가 DB를 통해서만 한다.
 */
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductSearchService productSearchService;

    public ProductController(ProductSearchService productSearchService) {
        this.productSearchService = productSearchService;
    }

    /** 기존 쇼핑몰 단순 검색창 (겸용, 그대로 유지) */
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

    /**
     * Agent의 find_frequent_purchase / search_products 도구가 쓰는 조건부 검색.
     * 예: GET /api/products/search-advanced?keywords=우유&keywords=두유&maxPrice=20000&sortBy=price_asc
     */
    @GetMapping("/search-advanced")
    public ResponseEntity<List<ProductSearchResponse>> searchAdvanced(
            @RequestParam(required = false) List<String> keywords,
            @RequestParam(required = false) List<String> categoryHints,
            @RequestParam(required = false) Integer minPrice,
            @RequestParam(required = false) Integer maxPrice,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) Integer limit
    ) {
        return ResponseEntity.ok(
                productSearchService.searchAdvanced(keywords, categoryHints, minPrice, maxPrice, sortBy, limit)
        );
    }

    /** Agent의 compare_products 도구가 쓰는 벌크 조회 (sku_id 목록으로 정확히 재조회) */
    @GetMapping("/by-skus")
    public ResponseEntity<List<ProductSearchResponse>> getBySkuIds(@RequestParam List<Integer> skuIds) {
        return ResponseEntity.ok(productSearchService.getBySkuIds(skuIds));
    }

    /** 상품 상세 (요구사항 9번 get_product) */
    @GetMapping("/{skuId}")
    public ResponseEntity<ProductSearchResponse> getProduct(@PathVariable Integer skuId) {
        List<ProductSearchResponse> found = productSearchService.getBySkuIds(List.of(skuId));
        if (found.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(found.get(0));
    }

    /** 대체상품 후보 (원래 ai_search.py의 /api/products/{sku_id}/alternatives가 DB에서 직접 하던 것) */
    @GetMapping("/{skuId}/alternatives/candidates")
    public ResponseEntity<AlternativesResponse> getAlternativeCandidates(@PathVariable Integer skuId) {
        AlternativesResponse response = productSearchService.getAlternatives(skuId);
        if (response == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(response);
    }
}