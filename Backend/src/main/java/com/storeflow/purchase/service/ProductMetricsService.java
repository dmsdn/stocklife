package com.storeflow.purchase.service;

import com.storeflow.inventory.entity.ConsumerEvent;
import com.storeflow.inventory.repository.ConsumerEventRepository;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import com.storeflow.purchase.dto.ProductMetricsResponse;
import com.storeflow.purchase.repository.PurchaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

@Service
public class ProductMetricsService {

    private static final int BEHAVIOR_WINDOW_DAYS = 30;

    private final ProductRepository productRepository;
    private final PurchaseRepository purchaseRepository;
    private final ConsumerEventRepository consumerEventRepository;

    public ProductMetricsService(ProductRepository productRepository,
                                 PurchaseRepository purchaseRepository,
                                 ConsumerEventRepository consumerEventRepository) {
        this.productRepository = productRepository;
        this.purchaseRepository = purchaseRepository;
        this.consumerEventRepository = consumerEventRepository;
    }

    /**
     * 여러 상품의 핵심 지표를 한 번에 계산한다.
     * Claude/Agent는 원시 구매행이나 이벤트를 직접 세지 않고 이 결과만 근거로 판단한다.
     */
    @Transactional(readOnly = true)
    public List<ProductMetricsResponse> getMetrics(List<Integer> skuIds) {
        if (skuIds == null || skuIds.isEmpty()) {
            throw new IllegalArgumentException("skuIds를 1개 이상 지정해야 합니다.");
        }

        // 같은 sku를 중복 요청해도 집계는 한 번만 한다. 입력 순서는 보존한다.
        List<Integer> uniqueSkuIds = new ArrayList<>(new LinkedHashSet<>(skuIds));
        if (uniqueSkuIds.size() > 20) {
            throw new IllegalArgumentException("한 번에 최대 20개 상품까지만 조회할 수 있습니다.");
        }

        Instant since30d = Instant.now().minus(BEHAVIOR_WINDOW_DAYS, ChronoUnit.DAYS);
        List<ProductMetricsResponse> result = new ArrayList<>();

        for (Integer skuId : uniqueSkuIds) {
            Product product = productRepository.findById(skuId)
                    .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 skuId: " + skuId));

            long sales30d = nz(purchaseRepository.sumQtySince(skuId, since30d));
            long salesTotal = nz(purchaseRepository.sumQtyTotal(skuId));
            long uniqueBuyers = nz(purchaseRepository.countUniqueBuyers(skuId));
            long repeatBuyers = nz(purchaseRepository.countRepeatBuyers(skuId));

            long cartAdds30d = consumerEventRepository.countBySkuAndTypeSince(
                    skuId, ConsumerEvent.EventType.SCAN_ADD, since30d);
            long searches30d = consumerEventRepository.countBySkuAndTypeSince(
                    skuId, ConsumerEvent.EventType.SEARCH, since30d);
            long views30d = consumerEventRepository.countBySkuAndTypeSince(
                    skuId, ConsumerEvent.EventType.VIEW, since30d);

            double repurchaseRate = uniqueBuyers == 0
                    ? 0.0
                    : Math.round((repeatBuyers * 10000.0 / uniqueBuyers)) / 100.0; // 퍼센트, 소수 둘째 자리

            result.add(new ProductMetricsResponse(
                    skuId,
                    product.getName(),
                    sales30d,
                    salesTotal,
                    cartAdds30d,
                    searches30d,
                    views30d,
                    uniqueBuyers,
                    repeatBuyers,
                    repurchaseRate
            ));
        }

        return result;
    }

    private long nz(Long value) {
        return value == null ? 0L : value;
    }
}
