package com.storeflow.inventory.repository;

import com.storeflow.inventory.dto.InventoryItemResponse;
import com.storeflow.inventory.dto.LocationProductResponse;
import com.storeflow.inventory.dto.PendingReplenishmentRow;
import com.storeflow.inventory.entity.Location;
import com.storeflow.inventory.entity.Stock;
import com.storeflow.product.entity.Product;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StockRepository extends JpaRepository<Stock, Stock.StockId> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Stock> findWithLockBySkuIdAndLocationId(Integer skuId, String locationId);

    /**
     * stocks.location_id는 UNIQUE(uq_stk_location) — 한 자리에 한 SKU만 재고를 가질 수 있다.
     * move() 목적지 검사는 "같은 SKU 재고가 있나"가 아니라 "이 자리에 어떤 SKU든 재고가
     * 있나"를 봐야 한다. 검사 범위가 좁으면 INSERT 시점에 제약 위반(500)으로 터진다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Stock> findWithLockByLocationId(String locationId);

    List<Stock> findBySkuId(Integer skuId);

    @Query("""
        SELECT s.locationId FROM Stock s, Location l
        WHERE s.skuId = :skuId AND s.locationId = l.locationId AND l.tierRole = :tierRole
        """)
    Optional<String> findLocationIdBySkuIdAndTierRole(@Param("skuId") Integer skuId,
                                                      @Param("tierRole") Location.TierRole tierRole);

    /** get_inventory(10번) — 위치별 재고를 합치지 않고 그대로 반환. */
    @Query("""
        SELECT NEW com.storeflow.inventory.dto.InventoryItemResponse(
            s.skuId, s.locationId, l.zoneId, l.tierRole, l.floorNo, l.x, l.y, s.qty)
        FROM Stock s, Location l
        WHERE s.skuId = :skuId AND s.locationId = l.locationId
        ORDER BY l.tierRole, l.floorNo
        """)
    List<InventoryItemResponse> findInventoryBySkuId(@Param("skuId") Integer skuId);

    /** get_inventory 배치판 — 여러 skuId를 한 번에 IN절로 조회(박은우님 요청). */
    @Query("""
        SELECT NEW com.storeflow.inventory.dto.InventoryItemResponse(
            s.skuId, s.locationId, l.zoneId, l.tierRole, l.floorNo, l.x, l.y, s.qty)
        FROM Stock s, Location l
        WHERE s.skuId IN :skuIds AND s.locationId = l.locationId
        ORDER BY s.skuId, l.tierRole, l.floorNo
        """)
    List<InventoryItemResponse> findInventoryBySkuIdIn(@Param("skuIds") List<Integer> skuIds);

    /** replenishment/pending(③) 1단계 — 현재 수량이 보충 임계 밑인 PICK 매대 전부. */
    @Query("""
        SELECT NEW com.storeflow.inventory.dto.PendingReplenishmentRow(
            s.skuId, s.locationId, l.floorNo)
        FROM Stock s, Location l, ShelfConfig c
        WHERE s.locationId = l.locationId AND l.tierRole = :pick
          AND c.skuId = s.skuId AND c.locationId = s.locationId
          AND s.qty < c.minQty
        """)
    List<PendingReplenishmentRow> findPendingPickShortages(@Param("pick") Location.TierRole pick);

    /**
     * GET /api/floors/{floorNo}/low-stock-locations(신규) — 특정 층의 PICK 매대 중 minQty
     * 미만인 것 전부(skuId 단위 행). findPendingPickShortages와 같은 조건에 floorNo 필터만
     * 추가한 버전 — NPC가 매대 하나하나를 순차로 조회하던 걸 없애기 위한 것.
     */
    @Query("""
        SELECT NEW com.storeflow.inventory.dto.PendingReplenishmentRow(
            s.skuId, s.locationId, l.floorNo)
        FROM Stock s, Location l, ShelfConfig c
        WHERE s.locationId = l.locationId AND l.tierRole = :pick AND l.floorNo = :floorNo
          AND c.skuId = s.skuId AND c.locationId = s.locationId
          AND s.qty < c.minQty
        """)
    List<PendingReplenishmentRow> findPendingPickShortagesByFloor(@Param("pick") Location.TierRole pick,
                                                                  @Param("floorNo") byte floorNo);

    /** replenishment/pending(③) 2단계 — 지금 재고(qty>0)가 있는 BULK 위치를 가진 skuId 전부. */
    @Query("""
        SELECT DISTINCT s.skuId FROM Stock s, Location l
        WHERE s.locationId = l.locationId AND l.tierRole = :bulk AND s.qty > 0
        """)
    List<Integer> findSkuIdsWithPositiveStockByTierRole(@Param("bulk") Location.TierRole bulk);

    /**
     * GET /api/locations/{locationId}/products(신규, Simulation 프론트 매대 클릭 팝업용).
     * 재고가 0인 SKU도 "매대는 있지만 품절"로 보여줘야 하므로 qty>0 필터를 걸지 않는다.
     */
    @Query("""
        SELECT NEW com.storeflow.inventory.dto.LocationProductResponse(
            s.skuId, p.name, p.priceKrw, s.qty)
        FROM Stock s, Product p
        WHERE s.locationId = :locationId AND s.skuId = p.skuId
        ORDER BY s.skuId
        """)
    List<LocationProductResponse> findProductsByLocationId(@Param("locationId") String locationId);
}