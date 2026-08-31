package com.storeflow.product.service;

import com.storeflow.product.dto.AlternativesResponse;
import com.storeflow.product.dto.ProductDetailResponse;
import com.storeflow.product.dto.ProductSearchResponse;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import com.storeflow.promotion.entity.Promotion;
import com.storeflow.promotion.repository.PromotionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 쇼핑몰 검색과 AI Agent 검색이 함께 쓰는 상품 조회 서비스.
 * 상품 사실 데이터는 이 서비스/DB에서만 읽고, AI는 결과를 해석하는 역할만 맡는다.
 *
 * 모든 조회 경로는 반환하는 상품들의 진행 중 행사(Promotion)를 함께 조회해서
 * ProductSearchResponse/ProductDetailResponse의 onPromo/discountKrw/finalPriceKrw로
 * 실어 보낸다. 이게 없으면 AI(compare_products 등)가 정가(priceKrw)만 보고
 * 가격 비교를 하게 된다 — 행사 반영은 여기 한 곳에서만 계산해야 한다(가격 계산은
 * 백엔드가, AI는 결과 해석만).
 */
@Service
public class ProductSearchService {

    private static final int MAX_RESULTS = 20;
    private static final int MAX_ALTERNATIVES = 5;
    private static final double ALT_PRICE_MIN_RATIO = 0.5;
    private static final double ALT_PRICE_MAX_RATIO = 1.8;

    private static final Pattern PAREN = Pattern.compile("\\([^)]*\\)");
    private static final Pattern BRACKET = Pattern.compile("\\[[^]]*]");
    private static final List<String> KNOWN_ADJ = List.of(
            "프리미엄", "국산", "제철", "대용량", "실속형", "든든한", "가성비", "저렴한", "싼", "좋은"
    );

    private final ProductRepository productRepository;
    private final PromotionRepository promotionRepository;

    public ProductSearchService(ProductRepository productRepository, PromotionRepository promotionRepository) {
        this.productRepository = productRepository;
        this.promotionRepository = promotionRepository;
    }

    /** 기존 단순 검색 API 호환용. */
    @Transactional(readOnly = true)
    public List<ProductSearchResponse> search(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return List.of();
        }
        List<Product> products = productRepository.searchByKeyword(keyword.trim()).stream()
                .limit(MAX_RESULTS)
                .toList();
        return toResponses(products);
    }

    /** 요구사항 정의서의 조건형 search_products. */
    @Transactional(readOnly = true)
    public List<ProductSearchResponse> search(
            String keyword,
            String categoryL1,
            String categoryL2,
            Integer maxPrice,
            boolean onPromoOnly,
            Integer recentDays
    ) {
        String normalizedKeyword = normalizeNullable(keyword);
        String normalizedCategoryL1 = normalizeNullable(categoryL1);
        String normalizedCategoryL2 = normalizeNullable(categoryL2);
        LocalDate sinceDate = recentDays == null ? null : LocalDate.now().minusDays(Math.max(0, recentDays));

        List<Product> products = productRepository.search(
                        Product.LifecycleStatus.ACTIVE,
                        normalizedKeyword,
                        normalizedCategoryL1,
                        normalizedCategoryL2,
                        maxPrice,
                        sinceDate,
                        onPromoOnly,
                        Instant.now())
                .stream()
                .limit(MAX_RESULTS)
                .toList();
        return toResponses(products);
    }

    @Transactional(readOnly = true)
    public ProductDetailResponse getDetail(Integer skuId) {
        Product product = productRepository.findById(skuId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 상품입니다. skuId=" + skuId));
        return new ProductDetailResponse(product, findActivePromotion(skuId));
    }

    /** 바코드 조회(36번). Scan&Go의 시작점. */
    @Transactional(readOnly = true)
    public ProductDetailResponse getByBarcode(String barcode) {
        Product product = productRepository.findByBarcode(barcode)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 바코드입니다. barcode=" + barcode));
        return new ProductDetailResponse(product, findActivePromotion(product.getSkuId()));
    }

    /**
     * AI 검색 호환 API. 키워드 -> 카테고리 -> 가격 범위 순으로 후보를 찾는다.
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
        int effectiveLimit = (limit == null || limit <= 0)
                ? MAX_RESULTS
                : Math.min(limit, MAX_RESULTS);

        List<Product> candidates = List.of();

        if (keywords != null && !keywords.isEmpty()) {
            candidates = keywords.stream()
                    .map(ProductSearchService::normalizeNullable)
                    .filter(kw -> kw != null && !KNOWN_ADJ.contains(kw))
                    .flatMap(kw -> productRepository.searchByKeyword(kw).stream())
                    .distinct()
                    .toList();
        }

        if (candidates.isEmpty() && categoryHints != null && !categoryHints.isEmpty()) {
            candidates = categoryHints.stream()
                    .map(ProductSearchService::normalizeNullable)
                    .filter(c -> c != null)
                    .flatMap(c -> productRepository.findByCategoryHint(c).stream())
                    .distinct()
                    .toList();
        }

        if (candidates.isEmpty() && (minPrice != null || maxPrice != null)) {
            int lo = minPrice == null ? 0 : Math.max(0, minPrice);
            int hi = maxPrice == null ? Integer.MAX_VALUE : maxPrice;
            candidates = productRepository.findByLifecycleStatusAndPriceKrwBetween(
                    Product.LifecycleStatus.ACTIVE, lo, hi);
        }

        List<Product> filtered = candidates.stream()
                .filter(p -> minPrice == null || p.getPriceKrw() >= minPrice)
                .filter(p -> maxPrice == null || p.getPriceKrw() <= maxPrice)
                .sorted(resolveComparator(sortBy))
                .limit(effectiveLimit)
                .toList();

        return toResponses(filtered);
    }

    @Transactional(readOnly = true)
    public List<ProductSearchResponse> getBySkuIds(List<Integer> skuIds) {
        if (skuIds == null || skuIds.isEmpty()) {
            return List.of();
        }
        List<Product> products = productRepository.findBySkuIdInAndLifecycleStatus(
                        skuIds, Product.LifecycleStatus.ACTIVE)
                .stream()
                .sorted(Comparator.comparingInt(p -> skuIds.indexOf(p.getSkuId())))
                .toList();
        // compare_products가 바로 이 경로를 쓴다 — 행사 정보가 빠지면 AI가 정가로만 비교하게 된다.
        return toResponses(products);
    }

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
                    categoryL2, skuId, minPrice, maxPrice, itemKeyword);
        }

        if (alternatives.isEmpty() && categoryL2 != null) {
            alternatives = productRepository.findAlternativesByPriceBand(
                    categoryL2, skuId, minPrice, maxPrice);
        }

        // 정렬은 애플리케이션 레벨에서 처리한다: price_krw가 BIGINT UNSIGNED라서
        // DB에서 (싼 가격 - 비싼 기준가)를 계산하면 음수가 아니라 언더플로가 나서
        // "Data truncation" 500 에러가 난다. Math.abs(int)는 부호 있는 계산이라 안전하다.
        List<Product> sortedAlternatives = alternatives.stream()
                .sorted(Comparator.comparingInt((Product p) -> Math.abs(p.getPriceKrw() - price))
                        .thenComparing(Product::getSkuId))
                .toList();

        List<ProductSearchResponse> altDtos = toResponses(
                sortedAlternatives.stream().limit(MAX_ALTERNATIVES).toList());

        ProductSearchResponse originalDto = new ProductSearchResponse(original, findActivePromotion(skuId));

        return new AlternativesResponse(originalDto, altDtos);
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

    private String extractItemKeyword(String name, String brand, String unit) {
        String cleaned = name == null ? "" : name;
        if (brand != null && !brand.isBlank()) {
            cleaned = cleaned.replace(brand, "");
        }
        if (unit != null && !unit.isBlank()) {
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

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    // ------------------------------------------------------------------
    // 행사(Promotion) 배치 조회 — 정가만 내려가지 않도록 모든 응답 경로가 이걸 거친다.
    // ------------------------------------------------------------------

    private List<ProductSearchResponse> toResponses(List<Product> products) {
        if (products.isEmpty()) {
            return List.of();
        }
        List<Integer> skuIds = products.stream().map(Product::getSkuId).toList();
        Map<Integer, Promotion> promoBySku = promotionRepository
                .findActiveBySkuIdIn(skuIds, Instant.now()).stream()
                .collect(Collectors.toMap(Promotion::getSkuId, Function.identity(), (a, b) -> a));

        return products.stream()
                .map(p -> new ProductSearchResponse(p, promoBySku.get(p.getSkuId())))
                .toList();
    }

    private Promotion findActivePromotion(Integer skuId) {
        List<Promotion> active = promotionRepository.findActiveBySkuId(skuId, Instant.now());
        return active.isEmpty() ? null : active.get(0);
    }
}