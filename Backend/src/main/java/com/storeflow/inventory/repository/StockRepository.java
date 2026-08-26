package com.storeflow.inventory.repository;

import com.storeflow.inventory.dto.InventoryItemResponse;
import com.storeflow.inventory.dto.PendingReplenishmentRow;
import com.storeflow.inventory.entity.Location;
import com.storeflow.inventory.entity.Stock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.storeflow.inventory.dto.PendingReplenishmentRow;

import java.util.List;
import java.util.Optional;

public interface StockRepository extends JpaRepository<Stock, Stock.StockId> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Stock> findWithLockBySkuIdAndLocationId(Integer skuId, String locationId);

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
            s.locationId, l.zoneId, l.tierRole, l.floorNo, l.x, l.y, s.qty)
        FROM Stock s, Location l
        WHERE s.skuId = :skuId AND s.locationId = l.locationId
        ORDER BY l.tierRole, l.floorNo
        """)
    List<InventoryItemResponse> findInventoryBySkuId(@Param("skuId") Integer skuId);

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

    /** replenishment/pending(③) 2단계 — 지금 재고(qty>0)가 있는 BULK 위치를 가진 skuId 전부. */
    @Query("""
        SELECT DISTINCT s.skuId FROM Stock s, Location l
        WHERE s.locationId = l.locationId AND l.tierRole = :bulk AND s.qty > 0
        """)
    List<Integer> findSkuIdsWithPositiveStockByTierRole(@Param("bulk") Location.TierRole bulk);

}