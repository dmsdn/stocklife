package com.storeflow.product.service;

import com.storeflow.product.dto.ProductSearchResponse;
import com.storeflow.product.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ProductSearchService {

    private static final int MAX_RESULTS = 20;

    private final ProductRepository productRepository;

    public ProductSearchService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public List<ProductSearchResponse> search(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return List.of();
        }

        return productRepository.searchByKeyword(keyword.trim()).stream()
                .limit(MAX_RESULTS)
                .map(ProductSearchResponse::new)
                .toList();
    }
}