package com.storeflow.product.dto;

import java.util.List;

public class AlternativesResponse {
    private final ProductSearchResponse original;
    private final List<ProductSearchResponse> alternatives;

    public AlternativesResponse(ProductSearchResponse original, List<ProductSearchResponse> alternatives) {
        this.original = original;
        this.alternatives = alternatives;
    }

    public ProductSearchResponse getOriginal() { return original; }
    public List<ProductSearchResponse> getAlternatives() { return alternatives; }
}