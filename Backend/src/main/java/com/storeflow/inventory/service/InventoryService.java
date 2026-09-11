package com.storeflow.inventory.service;

import com.storeflow.inventory.dto.BelowParTimestamp;
import com.storeflow.inventory.dto.ChangeEventResponse;
import com.storeflow.inventory.dto.WorldHealthResponse;
import com.storeflow.inventory.dto.InventoryItemResponse;
import com.storeflow.inventory.dto.PendingReplenishmentResponse;
import com.storeflow.inventory.dto.PendingReplenishmentRow;
import com.storeflow.inventory.entity.Location;
import com.storeflow.inventory.entity.ShelfEvent;
import com.storeflow.inventory.entity.Stock;
import com.storeflow.inventory.repository.ShelfConfigRepository;
import com.storeflow.inventory.repository.ShelfEventRepository;
import com.storeflow.inventory.repository.MapCellRepository;
import com.storeflow.inventory.repository.StockRepository;
import com.storeflow.cart.repository.CartItemRepository;
import com.storeflow.notification.service.NotificationService;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import com.storeflow.realtime.service.EventBroadcastService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
    private final CartItemRepository cartItemRepository;
    private final NotificationService notificationService;
    private final MapCellRepository mapCellRepository;

    public InventoryService(StockRepository stockRepository,
                            ShelfConfigRepository shelfConfigRepository,
                            ShelfEventRepository shelfEventRepository,
                            ProductRepository productRepository,
                            EventBroadcastService eventBroadcastService,
                            CartItemRepository cartItemRepository,
                            NotificationService notificationService,
                            MapCellRepository mapCellRepository) {
        this.stockRepository = stockRepository;
        this.shelfConfigRepository = shelfConfigRepository;
        this.shelfEventRepository = shelfEventRepository;
        this.productRepository = productRepository;
        this.eventBroadcastService = eventBroadcastService;
        this.cartItemRepository = cartItemRepository;
        this.notificationService = notificationService;
        this.mapCellRepository = mapCellRepository;
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

            // 5-5(알림 트리거) "품절": 재고가 있다가 0이 된 순간, 자기 리스트(장바구니)에
            // 이 상품을 담아둔 회원들에게만 알린다. (재입고 알림과 짝을 이루는 로직)
            notifyCartOwnersOfStockout(skuId);
        }

        // 5-5(알림 트리거) "재입고": 품절(0) 상태였다가 다시 채워졌을 때만 알린다.
        // 그냥 수량이 조금씩 오르내리는 것까지 매번 알리면 스팸이 되므로, "없다가 생겼다"는
        // 순간에만 트리거한다. 이 상품을 자기 리스트(장바구니)에 담아둔 회원들에게만 발송.
        if (eventType == ShelfEvent.EventType.RESTOCK_IN && oldQty == 0 && newQty > 0) {
            notifyCartOwnersOfRestock(skuId);
        }
    }

    private void notifyCartOwnersOfRestock(Integer skuId) {
        List<Long> consumerIds = cartItemRepository.findConsumerIdsBySkuId(skuId);
        if (consumerIds.isEmpty()) {
            return;
        }
        Product product = productRepository.findById(skuId).orElse(null);
        String productName = product != null ? product.getName() : ("상품 #" + skuId);

        for (Long consumerId : consumerIds) {
            notificationService.createNotification(
                    consumerId,
                    "RESTOCK",
                    "재입고 알림",
                    productName + "이(가) 다시 입고됐어요. 장바구니에 담아두신 상품이에요!",
                    null
            );
        }
    }

    private void notifyCartOwnersOfStockout(Integer skuId) {
        List<Long> consumerIds = cartItemRepository.findConsumerIdsBySkuId(skuId);
        if (consumerIds.isEmpty()) {
            return;
        }
        Product product = productRepository.findById(skuId).orElse(null);
        String productName = product != null ? product.getName() : ("상품 #" + skuId);

        for (Long consumerId : consumerIds) {
            notificationService.createNotification(
                    consumerId,
                    "STOCKOUT",
                    "품절 알림",
                    productName + "이(가) 품절됐어요. 장바구니에 담아두신 상품이에요!",
                    null
            );
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

        if (stockRepository.findWithLockByLocationId(toLocationId).isPresent()) {
            throw new IllegalStateException("대상 위치에 이미 재고가 있습니다. locationId=" + toLocationId);
        }
        // stocks 에 UNIQUE(location_id) 가 걸려 있다 — **한 자리에 한 SKU** 가
        // 이 세계의 불변식이다(매대 한 칸 = 상품 하나). 위 검사는 "같은 SKU"만
        // 보므로, 다른 SKU 가 이미 쓰는 자리로 옮기면 여기를 통과했다가
        // INSERT 에서 제약 위반으로 **500** 이 난다. 부르는 쪽에서는 서버가
        // 고장난 것처럼 보이는데 실제로는 요청이 규칙을 어긴 것이다.
        // 409 로 이유를 말한다 — 조용히 500 을 내면 그 자리를 못 찾는다.
        if (stockRepository.findByLocationId(toLocationId).isPresent()) {
            throw new IllegalStateException(
                    "대상 위치가 이미 다른 상품에 쓰이고 있습니다(한 자리에 한 SKU). locationId="
                            + toLocationId);
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

    /**
     * 세계 데이터가 실려 있는지 알려준다 (09-10).
     *
     * [왜] 보충 대기 큐가 빈 배열로 나갈 때, 그게 "정말 0건"인지 "데이터가 없어서 0건"인지
     * 받는 쪽은 구분할 수 없다. Agent 는 후자를 "매장이 한산하다"로 읽어 잘못된 보충 확률을
     * 냈고, 에러가 아니라 그럴듯한 오답이라 응답 검증으로도 안 걸렸다. 그 판단 근거를
     * 데이터를 공급하는 이쪽에서 내려준다.
     *
     * 세 종류를 함께 주는 이유는 실패 모양이 다르기 때문이다. 재고와 매대 설정이 없으면
     * 큐를 계산할 수 없고, 격자가 없으면 재고를 알아도 갈 수가 없다.
     */
    @Transactional(readOnly = true)
    public WorldHealthResponse getWorldHealth() {
        return new WorldHealthResponse(
                stockRepository.count(),
                shelfConfigRepository.count(),
                mapCellRepository.count(),
                getPendingReplenishments().size(),
                shelfEventRepository.findLatestOccurredAt());
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

    /**
     * GET /api/floors/{floorNo}/low-stock-locations(신규) — 층 전체를 한 번의 쿼리로 훑어서
     * 재고 부족 매대와 그 매대에서 부족한 skuId들을 매대 단위로 묶어서 돌려준다. NPC가
     * findLowStockTarget에서 매대 하나마다 /api/locations/{id}/products를 순차 호출하던
     * (매대 수천 개 x 1 요청) 구조를 없애기 위한 전용 엔드포인트.
     */
    @Transactional(readOnly = true)
    public List<com.storeflow.inventory.dto.LowStockLocationResponse> getLowStockLocationsByFloor(int floorNo) {
        List<PendingReplenishmentRow> rows =
                stockRepository.findPendingPickShortagesByFloor(Location.TierRole.PICK, (byte) floorNo);

        Map<String, List<Integer>> skuIdsByLocation = new LinkedHashMap<>();
        for (PendingReplenishmentRow row : rows) {
            skuIdsByLocation.computeIfAbsent(row.getLocationId(), k -> new java.util.ArrayList<>())
                    .add(row.getSkuId());
        }
        return skuIdsByLocation.entrySet().stream()
                .map(e -> new com.storeflow.inventory.dto.LowStockLocationResponse(e.getKey(), e.getValue()))
                .toList();
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