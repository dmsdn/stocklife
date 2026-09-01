package com.storeflow.point.repository;

import com.storeflow.point.entity.PointTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PointTransactionRepository
        extends JpaRepository<PointTransaction, Long> {

    List<PointTransaction>
    findByConsumerIdOrderByCreatedAtDescPointTransactionIdDesc(
            Long consumerId
    );
}