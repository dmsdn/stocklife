package com.storeflow.inventory.repository;

import com.storeflow.inventory.entity.ShelfEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

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
}