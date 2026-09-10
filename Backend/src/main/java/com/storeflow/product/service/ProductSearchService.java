package com.storeflow.product.service;

import com.storeflow.product.dto.AlternativesResponse;
import com.storeflow.product.dto.ProductDetailResponse;
import com.storeflow.product.dto.ProductSearchResponse;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import com.storeflow.promotion.entity.Promotion;
import com.storeflow.promotion.repository.PromotionRepository;
import com.storeflow.inventory.entity.Location;
import com.storeflow.inventory.entity.Stock;
import com.storeflow.inventory.repository.LocationRepository;
import com.storeflow.inventory.repository.StockRepository;
import org.springframework.cache.annotation.Cacheable;
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
 * 실어 보낸다.
 */
@Service
public class ProductSearchService {

    private static final int MAX_ALTERNATIVES = 5;
    private static final double ALT_PRICE_MIN_RATIO = 0.5;
    private static final double ALT_PRICE_MAX_RATIO = 1.8;

    private static final Pattern PAREN =
            Pattern.compile("\\([^)]*\\)");

    private static final Pattern BRACKET =
            Pattern.compile("\\[[^]]*]");

    private static final List<String> KNOWN_ADJ = List.of(
            "프리미엄",
            "국산",
            "제철",
            "대용량",
            "실속형",
            "든든한",
            "가성비",
            "저렴한",
            "싼",
            "좋은"
    );

    private final ProductRepository productRepository;
    private final PromotionRepository promotionRepository;
    private final StockRepository stockRepository;
    private final LocationRepository locationRepository;

    public ProductSearchService(
            ProductRepository productRepository,
            PromotionRepository promotionRepository,
            StockRepository stockRepository,
            LocationRepository locationRepository
    ) {
        this.productRepository = productRepository;
        this.promotionRepository = promotionRepository;
        this.stockRepository = stockRepository;
        this.locationRepository = locationRepository;
    }

    /**
     * 기존 단순 검색 API 호환용.
     *
     * 기존에는 MAX_RESULTS = 20으로 최대 20개까지만 반환했지만,
     * 이제 검색 결과를 별도로 제한하지 않는다.
     */
    @Transactional(readOnly = true)
    public List<ProductSearchResponse> search(
            String keyword
    ) {
        if (keyword == null || keyword.isBlank()) {
            return List.of();
        }

        List<Product> products =
                productRepository
                        .searchByKeyword(
                                keyword.trim()
                        )
                        .stream()
                        .toList();

        return toResponses(products);
    }

    /**
     * 요구사항 정의서의 조건형 search_products.
     *
     * 이 조회 역시 기존 20개 제한을 제거했다.
     */
    @Transactional(readOnly = true)
    public List<ProductSearchResponse> search(
            String keyword,
            String categoryL1,
            String categoryL2,
            Integer maxPrice,
            boolean onPromoOnly,
            Integer recentDays
    ) {
        String normalizedKeyword =
                normalizeNullable(keyword);

        String normalizedCategoryL1 =
                normalizeNullable(categoryL1);

        String normalizedCategoryL2 =
                normalizeNullable(categoryL2);

        LocalDate sinceDate =
                recentDays == null
                        ? null
                        : LocalDate.now()
                        .minusDays(
                                Math.max(
                                        0,
                                        recentDays
                                )
                        );

        List<Product> products =
                productRepository
                        .search(
                                Product.LifecycleStatus.ACTIVE,
                                normalizedKeyword,
                                normalizedCategoryL1,
                                normalizedCategoryL2,
                                maxPrice,
                                sinceDate,
                                onPromoOnly,
                                Instant.now()
                        )
                        .stream()
                        .toList();

        return toResponses(products);
    }

    @Transactional(readOnly = true)
    // 09-08 성능. 상품 마스터 정보는 시연 중 바뀌지 않으므로 메모리에 담아 DB 왕복을 없앤다.
    // 이 환경은 왕복 한 번이 약 195ms라, 장바구니 화면처럼 상품을 여러 개 조회하는 화면에서
    // 그대로 몇 초가 된다. 재고는 여기 안 들어간다(CacheConfig 주석 참고).
    @Cacheable(value = com.storeflow.global.config.CacheConfig.PRODUCT_DETAIL, key = "#skuId")
    public ProductDetailResponse getDetail(
            Integer skuId
    ) {
        Product product =
                productRepository
                        .findById(skuId)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "존재하지 않는 상품입니다. skuId="
                                                        + skuId
                                        )
                        );

        return new ProductDetailResponse(
                product,
                findActivePromotion(skuId)
        );
    }

    /**
     * 바코드 조회(36번).
     * Scan&Go의 시작점.
     */
    @Transactional(readOnly = true)
    public ProductDetailResponse getByBarcode(
            String barcode
    ) {
        Product product =
                productRepository
                        .findByBarcode(barcode)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "존재하지 않는 바코드입니다. barcode="
                                                        + barcode
                                        )
                        );

        ProductDetailResponse response = new ProductDetailResponse(
                product,
                findActivePromotion(
                        product.getSkuId()
                )
        );
        // 09-02: 스캔 위치 앵커용 — 이 SKU 의 PICK 매대 하나(여러 개면 첫 것). 재고가 0 이어도
        // 매대 자리는 자리다(손님은 빈 매대 앞에서도 스캔한다). 없으면 null 로 둔다.
        for (Stock stock : stockRepository.findBySkuId(product.getSkuId())) {
            Location location = locationRepository.findById(stock.getLocationId()).orElse(null);
            if (location != null && location.getTierRole() == Location.TierRole.PICK) {
                response.setPickLocation(location.getLocationId(), (int) location.getFloorNo());
                break;
            }
        }
        return response;
    }

    /**
     * AI 검색 호환 API.
     *
     * 키워드 -> 카테고리 -> 가격 범위 순으로 후보를 찾는다.
     *
     * limit이 null 또는 0 이하이면 전체 결과를 반환한다.
     * limit이 양수이면 요청한 개수만 반환한다.
     *
     * 기존처럼 최대 20개로 강제 제한하지 않는다.
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
        Integer effectiveLimit =
                (limit == null || limit <= 0)
                        ? null
                        : limit;

        List<Product> candidates =
                List.of();

        /*
         * 1. 키워드 후보 검색
         */
        if (
                keywords != null
                        && !keywords.isEmpty()
        ) {
            candidates =
                    keywords
                            .stream()
                            .map(
                                    ProductSearchService
                                            ::normalizeNullable
                            )
                            .filter(
                                    kw ->
                                            kw != null
                                                    && !KNOWN_ADJ.contains(
                                                    kw
                                            )
                            )
                            .flatMap(
                                    kw ->
                                            productRepository
                                                    .searchByKeyword(
                                                            kw
                                                    )
                                                    .stream()
                            )
                            .distinct()
                            .toList();
        }

        /*
         * 2. 키워드 검색 결과가 없으면 카테고리 힌트 사용
         */
        if (
                candidates.isEmpty()
                        && categoryHints != null
                        && !categoryHints.isEmpty()
        ) {
            candidates =
                    categoryHints
                            .stream()
                            .map(
                                    ProductSearchService
                                            ::normalizeNullable
                            )
                            .filter(
                                    c -> c != null
                            )
                            .flatMap(
                                    c ->
                                            productRepository
                                                    .findByCategoryHint(
                                                            c
                                                    )
                                                    .stream()
                            )
                            .distinct()
                            .toList();
        }

        /*
         * 3. 키워드/카테고리 후보가 없고 가격 조건만 있으면
         *    가격 범위로 조회
         */
        if (
                candidates.isEmpty()
                        && (
                        minPrice != null
                                || maxPrice != null
                )
        ) {
            int lo =
                    minPrice == null
                            ? 0
                            : Math.max(
                            0,
                            minPrice
                    );

            int hi =
                    maxPrice == null
                            ? Integer.MAX_VALUE
                            : maxPrice;

            candidates =
                    productRepository
                            .findByLifecycleStatusAndPriceKrwBetween(
                                    Product.LifecycleStatus.ACTIVE,
                                    lo,
                                    hi
                            );
        }

        /*
         * 4. 조건 필터 + 정렬
         */
        var filteredStream =
                candidates
                        .stream()
                        .filter(
                                p ->
                                        minPrice == null
                                                || p.getPriceKrw()
                                                >= minPrice
                        )
                        .filter(
                                p ->
                                        maxPrice == null
                                                || p.getPriceKrw()
                                                <= maxPrice
                        )
                        .sorted(
                                resolveComparator(
                                        sortBy
                                )
                        );

        /*
         * limit을 명시하지 않았으면 전체 반환.
         * limit을 명시했으면 요청 개수만 반환.
         */
        List<Product> filtered =
                effectiveLimit == null
                        ? filteredStream.toList()
                        : filteredStream
                        .limit(
                                effectiveLimit
                        )
                        .toList();

        return toResponses(filtered);
    }

    @Transactional(readOnly = true)
    public List<ProductSearchResponse> getBySkuIds(
            List<Integer> skuIds
    ) {
        if (
                skuIds == null
                        || skuIds.isEmpty()
        ) {
            return List.of();
        }

        List<Product> products =
                productRepository
                        .findBySkuIdInAndLifecycleStatus(
                                skuIds,
                                Product.LifecycleStatus.ACTIVE
                        )
                        .stream()
                        .sorted(
                                Comparator.comparingInt(
                                        p ->
                                                skuIds.indexOf(
                                                        p.getSkuId()
                                                )
                                )
                        )
                        .toList();

        /*
         * compare_products가 바로 이 경로를 사용한다.
         * 행사 정보가 빠지면 AI가 정가로만 비교하므로
         * 반드시 toResponses를 거친다.
         */
        return toResponses(products);
    }

    @Transactional(readOnly = true)
    public AlternativesResponse getAlternatives(
            Integer skuId
    ) {
        Product original =
                productRepository
                        .findById(skuId)
                        .orElse(null);

        if (original == null) {
            return null;
        }

        int price =
                original.getPriceKrw();

        int minPrice =
                Math.max(
                        0,
                        (int) (
                                price
                                        * ALT_PRICE_MIN_RATIO
                        )
                );

        int maxPrice =
                (int) (
                        price
                                * ALT_PRICE_MAX_RATIO
                );

        String categoryL2 =
                original.getCategoryL2();

        List<Product> alternatives =
                List.of();

        String itemKeyword =
                extractItemKeyword(
                        original.getName(),
                        original.getBrand(),
                        original.getUnit()
                );

        /*
         * 같은 소분류 + 상품명 핵심 키워드 기준
         */
        if (
                categoryL2 != null
                        && itemKeyword != null
        ) {
            alternatives =
                    productRepository
                            .findAlternativesByKeyword(
                                    categoryL2,
                                    skuId,
                                    minPrice,
                                    maxPrice,
                                    itemKeyword
                            );
        }

        /*
         * 키워드 기준 대체상품이 없으면 가격대 기준으로 완화
         */
        if (
                alternatives.isEmpty()
                        && categoryL2 != null
        ) {
            alternatives =
                    productRepository
                            .findAlternativesByPriceBand(
                                    categoryL2,
                                    skuId,
                                    minPrice,
                                    maxPrice
                            );
        }

        /*
         * price_krw가 BIGINT UNSIGNED이므로
         * DB에서 음수 차이를 계산하지 않고
         * Java에서 안전하게 정렬한다.
         */
        List<Product> sortedAlternatives =
                alternatives
                        .stream()
                        .sorted(
                                Comparator
                                        .comparingInt(
                                                (
                                                        Product p
                                                ) ->
                                                        Math.abs(
                                                                p.getPriceKrw()
                                                                        - price
                                                        )
                                        )
                                        .thenComparing(
                                                Product::getSkuId
                                        )
                        )
                        .toList();

        /*
         * 대체상품은 별도 기능이므로
         * 기존 5개 제한을 유지한다.
         */
        List<ProductSearchResponse> altDtos =
                toResponses(
                        sortedAlternatives
                                .stream()
                                .limit(
                                        MAX_ALTERNATIVES
                                )
                                .toList()
                );

        ProductSearchResponse originalDto =
                new ProductSearchResponse(
                        original,
                        findActivePromotion(
                                skuId
                        )
                );

        return new AlternativesResponse(
                originalDto,
                altDtos
        );
    }

    private Comparator<Product> resolveComparator(
            String sortBy
    ) {
        if (
                "price_desc".equals(
                        sortBy
                )
        ) {
            return Comparator
                    .comparingInt(
                            Product::getPriceKrw
                    )
                    .reversed()
                    .thenComparing(
                            Product::getSkuId
                    );
        }

        if (
                "price_asc".equals(
                        sortBy
                )
        ) {
            return Comparator
                    .comparingInt(
                            Product::getPriceKrw
                    )
                    .thenComparing(
                            Product::getSkuId
                    );
        }

        return Comparator.comparing(
                Product::getSkuId
        );
    }

    private String extractItemKeyword(
            String name,
            String brand,
            String unit
    ) {
        String cleaned =
                name == null
                        ? ""
                        : name;

        if (
                brand != null
                        && !brand.isBlank()
        ) {
            cleaned =
                    cleaned.replace(
                            brand,
                            ""
                    );
        }

        if (
                unit != null
                        && !unit.isBlank()
        ) {
            cleaned =
                    cleaned.replace(
                            unit,
                            ""
                    );
        }

        cleaned =
                PAREN
                        .matcher(cleaned)
                        .replaceAll(" ");

        cleaned =
                BRACKET
                        .matcher(cleaned)
                        .replaceAll(" ");

        for (
                String token :
                cleaned.split("\\s+")
        ) {
            String t =
                    token.trim();

            if (
                    !t.isEmpty()
                            && !KNOWN_ADJ.contains(
                            t
                    )
            ) {
                return t;
            }
        }

        return null;
    }

    private static String normalizeNullable(
            String value
    ) {
        if (value == null) {
            return null;
        }

        String trimmed =
                value.trim();

        return trimmed.isEmpty()
                ? null
                : trimmed;
    }

    // ------------------------------------------------------------------
    // 행사(Promotion) 배치 조회
    // ------------------------------------------------------------------

    private List<ProductSearchResponse> toResponses(
            List<Product> products
    ) {
        if (products.isEmpty()) {
            return List.of();
        }

        List<Integer> skuIds =
                products
                        .stream()
                        .map(
                                Product::getSkuId
                        )
                        .toList();

        Map<Integer, Promotion> promoBySku =
                promotionRepository
                        .findActiveBySkuIdIn(
                                skuIds,
                                Instant.now()
                        )
                        .stream()
                        .collect(
                                Collectors.toMap(
                                        Promotion::getSkuId,
                                        Function.identity(),
                                        (a, b) -> a
                                )
                        );

        return products
                .stream()
                .map(
                        p ->
                                new ProductSearchResponse(
                                        p,
                                        promoBySku.get(
                                                p.getSkuId()
                                        )
                                )
                )
                .toList();
    }

    private Promotion findActivePromotion(
            Integer skuId
    ) {
        List<Promotion> active =
                promotionRepository
                        .findActiveBySkuId(
                                skuId,
                                Instant.now()
                        );

        return active.isEmpty()
                ? null
                : active.get(0);
    }

    /**
     * 소비 분석 화면의 대분류 필터/범례용.
     * 전체 대분류(categoryL1) 목록.
     */
    @Transactional(readOnly = true)
    @Cacheable(com.storeflow.global.config.CacheConfig.CATEGORY_L1)
    public List<String> getAllCategoryL1() {
        return productRepository
                .findAllCategoryL1();
    }
}