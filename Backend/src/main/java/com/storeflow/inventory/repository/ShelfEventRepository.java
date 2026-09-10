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

    /**
     * 마지막으로 기록된 매대 사건 시각 (09-10, /internal/replenishment/health 용).
     *
     * 사건이 한 건도 없으면 null 이 온다 — 빈 테이블에 MAX 를 걸면 행 하나에 null 이
     * 담겨 나오기 때문이다. Optional 로 받으면 버전에 따라 해석이 갈릴 수 있어
     * 그냥 null 을 돌려주고 부르는 쪽에서 판단한다.
     */
    @Query("SELECT MAX(e.occurredAt) FROM ShelfEvent e")
    Instant findLatestOccurredAt();

}