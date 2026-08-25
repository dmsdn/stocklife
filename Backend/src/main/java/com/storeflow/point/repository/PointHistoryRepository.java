package com.storeflow.point.repository;

import com.storeflow.point.entity.PointHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PointHistoryRepository extends JpaRepository<PointHistory, Long> {
    List<PointHistory> findByConsumerIdOrderByCreatedAtDesc(Long consumerId);
    boolean existsByOrderIdAndType(Long orderId, PointHistory.Type type);
}