package com.storeflow.point.service;

import com.storeflow.point.dto.PointTransactionResponse;
import com.storeflow.point.entity.PointTransaction;
import com.storeflow.point.entity.PointTransactionType;
import com.storeflow.point.repository.PointTransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class PointService {

    private final PointTransactionRepository
            pointTransactionRepository;

    public PointService(
            PointTransactionRepository pointTransactionRepository
    ) {
        this.pointTransactionRepository =
                pointTransactionRepository;
    }

    /**
     * 포인트 거래내역 저장
     */
    @Transactional
    public void record(
            Long consumerId,
            Long orderId,
            PointTransactionType type,
            int amount,
            int balanceAfter,
            String description
    ) {

        PointTransaction transaction =
                new PointTransaction(
                        consumerId,
                        orderId,
                        type,
                        amount,
                        balanceAfter,
                        description
                );

        pointTransactionRepository.save(transaction);
    }

    /**
     * 로그인한 사용자의 포인트 내역 최신순 조회
     */
    @Transactional(readOnly = true)
    public List<PointTransactionResponse> getHistory(
            Long consumerId
    ) {

        return pointTransactionRepository
                .findByConsumerIdOrderByCreatedAtDescPointTransactionIdDesc(
                        consumerId
                )
                .stream()
                .map(PointTransactionResponse::new)
                .toList();
    }
}