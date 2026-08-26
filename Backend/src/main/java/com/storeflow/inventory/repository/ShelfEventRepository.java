package com.storeflow.inventory.repository;

import com.storeflow.inventory.dto.BelowParTimestamp;
import com.storeflow.inventory.entity.ShelfEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

import com.storeflow.inventory.dto.BelowParTimestamp;

public interface ShelfEventRepository extends JpaRepository<ShelfEvent, Long> {

    /** get_change_events(14번). */
    @Query("""
        SELECT e FROM ShelfEvent e
        WHERE e.eventType IN :eventTypes
          AND e.skuId IN :skuIds
          AND e.occurredAt >= :since
        ORDER BY e.occurredAt DESC
        """)
    List<ShelfEvent> findChangeEvents(@Param("eventTypes") List<ShelfEvent.EventType> eventTypes,
                                       @Param("skuIds") List<Integer> skuIds,
                                       @Param("since") Instant since);

  /** replenishment/pending(③) 3단계 — (skuId, locationId)별 가장 최근 BELOW_PAR 시각. */
    @Query("""
        SELECT NEW com.storeflow.inventory.dto.BelowParTimestamp(
            e.skuId, e.locationId, MAX(e.occurredAt))
        FROM ShelfEvent e
        WHERE e.eventType = :belowPar
        GROUP BY e.skuId, e.locationId
        """)
    List<BelowParTimestamp> findLatestBelowParTimestamps(@Param("belowPar") ShelfEvent.EventType belowPar);

}