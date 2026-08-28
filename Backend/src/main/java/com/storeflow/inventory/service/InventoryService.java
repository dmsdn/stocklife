package com.storeflow.inventory.service;

import com.storeflow.inventory.dto.BelowParTimestamp;
import com.storeflow.inventory.dto.ChangeEventResponse;
import com.storeflow.inventory.dto.InventoryItemResponse;
import com.storeflow.inventory.dto.PendingReplenishmentResponse;
import com.storeflow.inventory.dto.PendingReplenishmentRow;
import com.storeflow.inventory.entity.Location;
import com.storeflow.inventory.entity.ShelfEvent;
import com.storeflow.inventory.entity.Stock;
import com.storeflow.inventory.repository.ShelfConfigRepository;
import com.storeflow.inventory.repository.ShelfEventRepository;
import com.storeflow.inventory.repository.StockRepository;
import com.storeflow.product.repository.ProductRepository;
import com.storeflow.realtime.service.EventBroadcastService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.storeflow.inventory.dto.BelowParTimestamp;
import com.storeflow.inventory.dto.PendingReplenishmentResponse;
import com.storeflow.inventory.dto.PendingReplenishmentRow;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class InventoryService {

    private static final List<ShelfEvent.EventType> CHANGE_EVENT_TYPES = List.of(ShelfEvent.EventType.MOVE,
            ShelfEvent.EventType.RESTOCK_IN, ShelfEvent.EventType.STOCKOUT);

    private final StockRepository stockRepository;
    private final ShelfConfigRepository shelfConfigRepository;
    private final ShelfEventRepository shelfEventRepository;
    private final ProductRepository productRepository;
    private final EventBroadcastService eventBroadcastService;

    public InventoryService(StockRepository stockRepository,
            ShelfConfigRepository shelfConfigRepository,
            ShelfEventRepository shelfEventRepository,
            ProductRepository productRepository,
            EventBroadcastService eventBroadcastService) {
        this.stockRepository = stockRepository;
        this.shelfConfigRepository = shelfConfigRepository;
        this.shelfEventRepository = shelfEventRepository;
        this.productRepository = productRepository;
        this.eventBroadcastService = eventBroadcastService;
    }

    /** 요구사항 21: shelf_event는 저장한 걸 그대로 Agent 스트림에 흘려보낸다. */
    private void broadcast(ShelfEvent event) {
        Map<String, Object> data = new HashMap<>();
        data.put("skuId", event.getSkuId());
        data.put("locationId", event.getLocationId());
        data.put("qty", event.getQty());
        data.put("taskId", event.getTaskId());
        data.put("occurredAt", event.getOccurredAt().toString());
        eventBroadcastService.publishToAgent(event.getEventType().name(), data);
    }

    @Transactional
    public void applyChange(Integer skuId, String locationId, int deltaQty,
            ShelfEvent.EventType eventType, String taskId) {
        Stock stock = stockRepository.findWithLockBySkuIdAndLocationId(skuId, locationId)
                .orElseThrow(() -> new IllegalStateException(
                        "재고 행이 없습니다. skuId=" + skuId + ", locationId=" + locationId));

        int oldQty = stock.getQty();
        int newQty = oldQty + deltaQty;
        if (newQty < 0) {
            throw new IllegalStateException(
                    "재고가 부족합니다. skuId=" + skuId + ", 현재=" + oldQty + ", 요청=" + deltaQty);
        }
        stock.setQty(newQty);

        Instant now = Instant.now();
        broadcast(shelfEventRepository.save(new ShelfEvent(eventType, skuId, locationId,
                Math.abs(deltaQty), taskId, now, null)));

        shelfConfigRepository.findBySkuIdAndLocationId(skuId, locationId).ifPresent(cfg -> {
            if (oldQty >= cfg.getMinQty() && newQty < cfg.getMinQty()) {
                broadcast(shelfEventRepository.save(new ShelfEvent(
                        ShelfEvent.EventType.BELOW_PAR, skuId, locationId, newQty, null, now, null)));
            }
        });

        if (oldQty > 0 && newQty == 0) {
            broadcast(shelfEventRepository.save(new ShelfEvent(
                    ShelfEvent.EventType.STOCKOUT, skuId, locationId, 0, null, now, null)));
        }
    }

    @Transactional
    public void decreaseForSale(Integer skuId, int qty) {
        String pickLocationId = stockRepository
                .findLocationIdBySkuIdAndTierRole(skuId, Location.TierRole.PICK)
                .orElseThrow(() -> new IllegalStateException(
                        "PICK 위치 재고를 찾을 수 없습니다. skuId=" + skuId));
        applyChange(skuId, pickLocationId, -qty, ShelfEvent.EventType.SALE, null);
    }

    @Transactional
    public void move(Integer skuId, String fromLocationId, String toLocationId, String taskId) {
        Stock source = stockRepository.findWithLockBySkuIdAndLocationId(skuId, fromLocationId)
                .orElseThrow(() -> new IllegalStateException(
                        "이동할 재고가 없습니다. skuId=" + skuId + ", locationId=" + fromLocationId));

        if (stockRepository.findWithLockBySkuIdAndLocationId(skuId, toLocationId).isPresent()) {
            throw new IllegalStateException("대상 위치에 이미 재고가 있습니다. locationId=" + toLocationId);
        }

        int qty = source.getQty();
        stockRepository.delete(source);
        stockRepository.save(new Stock(skuId, toLocationId, qty));

        String payload = "{\"prev_location_id\":\"" + fromLocationId + "\"}";
        broadcast(shelfEventRepository.save(new ShelfEvent(
                ShelfEvent.EventType.MOVE, skuId, toLocationId, qty, taskId, Instant.now(), payload)));
    }

    @Transactional
    public void recordTaskStatus(ShelfEvent.EventType eventType, Integer skuId, String locationId, String taskId) {
        broadcast(shelfEventRepository.save(
                new ShelfEvent(eventType, skuId, locationId, null, taskId, Instant.now(), null)));
    }

    @Transactional(readOnly = true)
    public List<InventoryItemResponse> getInventory(Integer skuId) {
        if (!productRepository.existsById(skuId)) {
            throw new IllegalStateException("존재하지 않는 상품입니다. skuId=" + skuId);
        }
        return stockRepository.findInventoryBySkuId(skuId);
    }

    /** get_change_events(14번). */
    @Transactional(readOnly = true)
    public List<ChangeEventResponse> getChangeEvents(List<Integer> skuIds, int recentHours) {
        if (skuIds == null || skuIds.isEmpty()) {
            throw new IllegalArgumentException("상품 목록(skuIds)은 필수입니다.");
        }
        if (recentHours <= 0) {
            throw new IllegalArgumentException("hours는 1 이상이어야 합니다.");
        }
        Instant since = Instant.now().minus(recentHours, ChronoUnit.HOURS);
        return shelfEventRepository.findChangeEvents(CHANGE_EVENT_TYPES, skuIds, since).stream()
                .map(ChangeEventResponse::new)
                .toList();
    }

        /** replenishment/pending(③). 3개 쿼리를 합쳐서 최종 응답을 만든다. */
    @Transactional(readOnly = true)
    public List<PendingReplenishmentResponse> getPendingReplenishments() {
        List<PendingReplenishmentRow> rows =
                stockRepository.findPendingPickShortages(Location.TierRole.PICK);
        if (rows.isEmpty()) {
            return List.of();
        }

        Set<Integer> bulkSkuIds = new HashSet<>(
                stockRepository.findSkuIdsWithPositiveStockByTierRole(Location.TierRole.BULK));

        Map<String, Instant> queuedAtByKey = shelfEventRepository
                .findLatestBelowParTimestamps(ShelfEvent.EventType.BELOW_PAR).stream()
                .collect(Collectors.toMap(
                        t -> t.getSkuId() + "|" + t.getLocationId(),
                        BelowParTimestamp::getOccurredAt));

        return rows.stream()
                .map(r -> new PendingReplenishmentResponse(
                        r.getSkuId(),
                        r.getLocationId(),
                        r.getFloorNo(),
                        bulkSkuIds.contains(r.getSkuId()),
                        queuedAtByKey.get(r.getSkuId() + "|" + r.getLocationId())))
                .toList();
    }

    /** GET /api/locations/{locationId}/products(신규) — 매대 하나에 진열된 상품 목록. */
    @Transactional(readOnly = true)
    public List<com.storeflow.inventory.dto.LocationProductResponse> getProductsAtLocation(String locationId) {
        return stockRepository.findProductsByLocationId(locationId);
    }

    /** GET /api/products/inventory?skuIds=1,2,3(신규, 박은우님 요청) — 여러 skuId의 위치별 재고를 한 번에 조회, skuId별로 그룹핑해서 반환. */
    @Transactional(readOnly = true)
    public Map<Integer, List<InventoryItemResponse>> getInventoryBatch(List<Integer> skuIds) {
        if (skuIds == null || skuIds.isEmpty()) {
            throw new IllegalArgumentException("상품 목록(skuIds)은 필수입니다.");
        }
        return stockRepository.findInventoryBySkuIdIn(skuIds).stream()
                .collect(Collectors.groupingBy(InventoryItemResponse::getSkuId));
    }

    /** 환불 승인 시 재고 복원(33번). RESTOCK_IN 이벤트로 기록 — 판매 때 뺐던 PICK 위치에 되돌린다. */
    @Transactional
    public void restockForRefund(Integer skuId, int qty) {
        String pickLocationId = stockRepository
                .findLocationIdBySkuIdAndTierRole(skuId, Location.TierRole.PICK)
                .orElseThrow(() -> new IllegalStateException(
                        "PICK 위치 재고를 찾을 수 없습니다. skuId=" + skuId));
        applyChange(skuId, pickLocationId, qty, ShelfEvent.EventType.RESTOCK_IN, null);
    }
}