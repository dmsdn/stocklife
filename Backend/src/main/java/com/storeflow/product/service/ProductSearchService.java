package com.storeflow.product.service;

import com.storeflow.product.dto.AlternativesResponse;
import com.storeflow.product.dto.ProductDetailResponse;
import com.storeflow.product.dto.ProductSearchResponse;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 원래 ai-server/ai_search.py가 MySQL에 직접 SQLAlchemy로 하던 상품 검색/비교/대체상품
 * 후보 조회를 백엔드로 옮긴 것. Claude(Agent)는 여기서 나온 사실만 가지고 의도 해석·설명
 * 생성을 담당하고, 상품 사실 데이터(가격/카테고리/재고여부)는 전부 이 서비스가 책임진다.
 */
@Service
public class ProductSearchService {

    private static final int MAX_RESULTS = 20;
    private static final int MAX_ALTERNATIVES = 5;

    // 대체상품 후보를 원가의 몇 %~몇 % 범위에서 찾을지 (ai_search.py와 동일)
    private static final double ALT_PRICE_MIN_RATIO = 0.5;
    private static final double ALT_PRICE_MAX_RATIO = 1.8;

    private static final Pattern PAREN = Pattern.compile("\\([^)]*\\)");
    private static final Pattern BRACKET = Pattern.compile("\\[[^]]*]");
    private static final List<String> KNOWN_ADJ = List.of(
            "프리미엄", "국산", "제철", "대용량", "실속형", "든든한", "가성비", "저렴한", "싼", "좋은"
    );

    private final ProductRepository productRepository;

    public ProductSearchService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    /** 기존 쇼핑몰 검색창이 쓰던 단순 키워드 검색. 그대로 유지한다 (겸용). */
    @Transactional(readOnly = true)
    public List<ProductSearchResponse> search(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return List.of();
        }
        return productRepository.searchByKeyword(keyword.trim()).stream()
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

    /**
     * Agent(find find_frequent_purchase 등)가 쓰는 조건부 검색.
     * ai_search.py의 search_candidates()와 동일한 3단계 우선순위:
     *   1) 키워드 매치 -> 있으면 바로 반환
     *   2) 대분류 힌트 매치 -> 있으면 반환
     *   3) 키워드/카테고리 없이 가격 범위만 있으면 그걸로 반환
     * 가격 범위(minPrice/maxPrice)는 항상 AND로 덧붙는다.
     * 정렬(sortBy)과 limit도 Java 쪽에서 마지막에 적용한다.
     */
    @Transactional(readOnly = true)
    public List<ProductSearchResponse> searchAdvanced(
            List<String> keywords,
            List<String> categoryHints,
            Integer minPrice,
            Integer maxPrice,
            String sortBy,
            Integer limit
    ) {
        int effectiveLimit = (limit == null || limit <= 0) ? MAX_RESULTS : Math.min(limit, MAX_RESULTS);

        List<Product> candidates = List.of();

        if (keywords != null && !keywords.isEmpty()) {
            candidates = keywords.stream()
                    .filter(kw -> kw != null && !kw.isBlank() && !KNOWN_ADJ.contains(kw.trim()))
                    .flatMap(kw -> productRepository.searchByKeyword(kw.trim()).stream())
                    .distinct()
                    .toList();
        }

        if (candidates.isEmpty() && categoryHints != null && !categoryHints.isEmpty()) {
            candidates = categoryHints.stream()
                    .filter(c -> c != null && !c.isBlank())
                    .flatMap(c -> productRepository.findByCategoryHint(c.trim()).stream())
                    .distinct()
                    .toList();
        }

        if (candidates.isEmpty() && (minPrice != null || maxPrice != null)) {
            int lo = minPrice != null ? minPrice : 0;
            int hi = maxPrice != null ? maxPrice : Integer.MAX_VALUE;
            candidates = productRepository.findByActiveTrueAndPriceKrwBetween(lo, hi);
        }

        return candidates.stream()
                .filter(p -> minPrice == null || p.getPriceKrw() >= minPrice)
                .filter(p -> maxPrice == null || p.getPriceKrw() <= maxPrice)
                .sorted(resolveComparator(sortBy))
                .limit(effectiveLimit)
                .map(ProductSearchResponse::new)
                .toList();
    }

    private Comparator<Product> resolveComparator(String sortBy) {
        if ("price_desc".equals(sortBy)) {
            return Comparator.comparingInt(Product::getPriceKrw).reversed()
                    .thenComparing(Product::getSkuId);
        }
        if ("price_asc".equals(sortBy)) {
            return Comparator.comparingInt(Product::getPriceKrw)
                    .thenComparing(Product::getSkuId);
        }
        return Comparator.comparing(Product::getSkuId);
    }

    /** compare_products 도구 전용: sku_id 목록으로 정확히 조회 (Claude가 만든 값이 아니라 항상 재조회) */
    @Transactional(readOnly = true)
    public List<ProductSearchResponse> getBySkuIds(List<Integer> skuIds) {
        if (skuIds == null || skuIds.isEmpty()) {
            return List.of();
        }
        return productRepository.findBySkuIdInAndActiveTrue(skuIds).stream()
                .map(ProductSearchResponse::new)
                .toList();
    }

    /**
     * ai_search.py의 find_alternative_candidates()를 그대로 옮긴 것.
     * 같은 소분류(categoryL2) 안에서 원가의 50%~180% 범위 상품을 찾되,
     * 원 상품명에서 뽑은 대표 키워드로 먼저 시도하고, 없으면 가격대만으로 재시도한다.
     */
    @Transactional(readOnly = true)
    public AlternativesResponse getAlternatives(Integer skuId) {
        Product original = productRepository.findById(skuId).orElse(null);
        if (original == null) {
            return null;
        }

        int price = original.getPriceKrw();
        int minPrice = Math.max(0, (int) (price * ALT_PRICE_MIN_RATIO));
        int maxPrice = (int) (price * ALT_PRICE_MAX_RATIO);
        String categoryL2 = original.getCategoryL2();

        List<Product> alternatives = List.of();

        String itemKeyword = extractItemKeyword(original.getName(), original.getBrand(), original.getUnit());
        if (categoryL2 != null && itemKeyword != null) {
            alternatives = productRepository.findAlternativesByKeyword(
                    categoryL2, skuId, minPrice, maxPrice, itemKeyword, price
            );
        }

        if (alternatives.isEmpty() && categoryL2 != null) {
            alternatives = productRepository.findAlternativesByPriceBand(
                    categoryL2, skuId, minPrice, maxPrice, price
            );
        }

        List<ProductSearchResponse> altDtos = alternatives.stream()
                .limit(MAX_ALTERNATIVES)
                .map(ProductSearchResponse::new)
                .toList();

        return new AlternativesResponse(new ProductSearchResponse(original), altDtos);
    }

    /** ai_search.py의 extract_item_keyword()와 동일한 규칙 기반 키워드 추출. */
    private String extractItemKeyword(String name, String brand, String unit) {
        String cleaned = name;
        if (brand != null) {
            cleaned = cleaned.replace(brand, "");
        }
        if (unit != null) {
            cleaned = cleaned.replace(unit, "");
        }
        cleaned = PAREN.matcher(cleaned).replaceAll(" ");
        cleaned = BRACKET.matcher(cleaned).replaceAll(" ");

        for (String token : cleaned.split("\\s+")) {
            String t = token.trim();
            if (!t.isEmpty() && !KNOWN_ADJ.contains(t)) {
                return t;
            }
        }
        return null;
    }
}