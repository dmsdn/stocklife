package com.storeflow.product.controller;

import com.storeflow.product.dto.AlternativesResponse;
import com.storeflow.product.dto.ProductDetailResponse;
import com.storeflow.product.dto.ProductSearchResponse;
import com.storeflow.product.service.ProductSearchService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 상품 공개 조회 API. */
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductSearchService productSearchService;

    public ProductController(ProductSearchService productSearchService) {
        this.productSearchService = productSearchService;
    }

    /** 소비 분석 화면의 대분류 필터/범례용 — 전체 대분류(categoryL1) 목록. */
    @GetMapping("/categories")
    public ResponseEntity<List<String>> getAllCategoryL1() {
        return ResponseEntity.ok(productSearchService.getAllCategoryL1());
    }

    /** 쇼핑몰/요구사항 8번 조건형 검색. */
    // 09-08 성능. limit 을 추가했다(선택 파라미터, 안 주면 예전과 똑같이 전부 반환).
    // 홈 화면이 상품 8개를 보여주려고 조건 없는 search 로 전체 카탈로그(약 2.2MB)를 받아가고
    // 있었고, 그런 호출이 두 군데라 홈 한 번 여는 데 4.4MB가 오갔다. 프론트가 필요한 만큼만
    // 요청할 수 있도록 서버가 자를 수 있게 한다.
    @GetMapping("/search")
    public ResponseEntity<List<ProductSearchResponse>> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String categoryL1,
            @RequestParam(required = false) String categoryL2,
            @RequestParam(required = false) Integer maxPrice,
            @RequestParam(name = "onPromo", required = false, defaultValue = "false") boolean onPromoOnly,
            @RequestParam(required = false) Integer recentDays,
            @RequestParam(required = false) Integer limit
    ) {
        List<ProductSearchResponse> result = productSearchService.search(
                keyword, categoryL1, categoryL2, maxPrice, onPromoOnly, recentDays);
        if (limit != null && limit > 0 && result.size() > limit) {
            result = result.subList(0, limit);
        }
        return ResponseEntity.ok(result);
    }

    /** Agent가 쓰는 다중 키워드/가격 범위 검색. */
    @GetMapping("/search-advanced")
    public ResponseEntity<List<ProductSearchResponse>> searchAdvanced(
            @RequestParam(required = false) List<String> keywords,
            @RequestParam(required = false) List<String> categoryHints,
            @RequestParam(required = false) Integer minPrice,
            @RequestParam(required = false) Integer maxPrice,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) Integer limit
    ) {
        return ResponseEntity.ok(productSearchService.searchAdvanced(
                keywords, categoryHints, minPrice, maxPrice, sortBy, limit));
    }

    /** Agent compare_products용 sku 일괄 재조회. */
    @GetMapping("/by-skus")
    public ResponseEntity<List<ProductSearchResponse>> getBySkuIds(@RequestParam List<Integer> skuIds) {
        return ResponseEntity.ok(productSearchService.getBySkuIds(skuIds));
    }

    /** 요구사항 9번 상품 상세. 단종 상품도 과거 이력 설명을 위해 조회 가능하다. */
    @GetMapping("/{skuId}")
    public ResponseEntity<?> getProduct(@PathVariable Integer skuId) {
        try {
            ProductDetailResponse response = productSearchService.getDetail(skuId);
            return ResponseEntity.ok(response);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(404).body(e.getMessage());
        }
    }
    /** 바코드 조회(36번). Scan&Go의 시작점. */
    @GetMapping("/barcode/{barcode}")
    public ResponseEntity<?> getByBarcode(@PathVariable String barcode) {
        try {
            return ResponseEntity.ok(productSearchService.getByBarcode(barcode));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(404).body(e.getMessage());
        }
    }

    /** Agent 대체상품 후보 조회. */
    @GetMapping("/{skuId}/alternatives/candidates")
    public ResponseEntity<AlternativesResponse> getAlternativeCandidates(@PathVariable Integer skuId) {
        AlternativesResponse response = productSearchService.getAlternatives(skuId);
        if (response == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(response);
    }
}