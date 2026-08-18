package com.storeflow.product.service;

import com.storeflow.product.dto.ProductDetailResponse;
import com.storeflow.product.dto.ProductSearchResponse;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@Service
public class ProductSearchService {

    private static final int MAX_RESULTS = 20;

    private final ProductRepository productRepository;

    public ProductSearchService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public List<ProductSearchResponse> search(String keyword, String categoryL1, String categoryL2,
                                               Integer maxPrice, boolean onPromoOnly, Integer recentDays) {
        String normalizedKeyword = (keyword == null || keyword.isBlank()) ? null : keyword.trim();
        LocalDate sinceDate = (recentDays == null) ? null : LocalDate.now().minusDays(recentDays);

        return productRepository.search(Product.LifecycleStatus.ACTIVE, normalizedKeyword,
                        categoryL1, categoryL2, maxPrice, sinceDate, onPromoOnly, Instant.now())
                .stream()
                .limit(MAX_RESULTS)
                .map(ProductSearchResponse::new)
                .toList();
    }

    @Transactional(readOnly = true)
    public ProductDetailResponse getDetail(Integer skuId) {
        Product product = productRepository.findById(skuId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 상품입니다. skuId=" + skuId));
        return new ProductDetailResponse(product);
    }
}