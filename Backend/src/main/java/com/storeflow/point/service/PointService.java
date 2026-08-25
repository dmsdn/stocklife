package com.storeflow.point.service;

import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.order.entity.Order;
import com.storeflow.point.dto.PointHistoryResponse;
import com.storeflow.point.dto.PointSummaryResponse;
import com.storeflow.point.entity.PointHistory;
import com.storeflow.point.repository.PointHistoryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;

@Service
public class PointService {

    public static final int PURCHASE_EARNING_RATE_PERCENT = 2;

    private final PointHistoryRepository pointHistoryRepository;
    private final ConsumerRepository consumerRepository;

    public PointService(PointHistoryRepository pointHistoryRepository,
                        ConsumerRepository consumerRepository) {
        this.pointHistoryRepository = pointHistoryRepository;
        this.consumerRepository = consumerRepository;
    }

    /**
     * 구매 완료 금액의 2%를 적립한다. 1P = 1원이며 소수점 이하는 버린다.
     * (예: 10,099원 -> 201P)
     * 주문별 PURCHASE_EARN 기록이 이미 있으면 중복 적립하지 않는다.
     */
    @Transactional
    public int earnForPurchase(Consumer consumer, Order order) {
        if (pointHistoryRepository.existsByOrderIdAndType(order.getOrderId(), PointHistory.Type.PURCHASE_EARN)) {
            return 0;
        }

        int points = calculatePurchasePoints(order.getTotalAmount());
        if (points <= 0) return 0;

        consumer.addPoints(points);
        pointHistoryRepository.save(new PointHistory(
                consumer.getConsumerId(),
                order.getOrderId(),
                points,
                PointHistory.Type.PURCHASE_EARN,
                "구매 완료 2% 적립"
        ));
        return points;
    }

    /** 환불 승인 시 해당 주문에서 적립했던 2% 포인트를 한 번만 회수한다. */
    @Transactional
    public int revokeForRefund(Consumer consumer, Order order) {
        if (pointHistoryRepository.existsByOrderIdAndType(order.getOrderId(), PointHistory.Type.REFUND_REVOKE)) {
            return 0;
        }

        int points = calculatePurchasePoints(order.getTotalAmount());
        if (points <= 0) return 0;

        consumer.subtractPoints(points);
        pointHistoryRepository.save(new PointHistory(
                consumer.getConsumerId(),
                order.getOrderId(),
                -points,
                PointHistory.Type.REFUND_REVOKE,
                "환불 승인 포인트 회수"
        ));
        return points;
    }

    public int calculatePurchasePoints(int totalAmount) {
        if (totalAmount <= 0) return 0;
        return (int) (((long) totalAmount * PURCHASE_EARNING_RATE_PERCENT) / 100L);
    }

    @Transactional(readOnly = true)
    public PointSummaryResponse getMyPoints(Long consumerId) {
        Consumer consumer = consumerRepository.findById(consumerId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 회원입니다."));

        List<PointHistory> histories = pointHistoryRepository.findByConsumerIdOrderByCreatedAtDesc(consumerId);
        YearMonth currentMonth = YearMonth.now();

        int earnedThisMonth = histories.stream()
                .filter(h -> YearMonth.from(h.getCreatedAt()).equals(currentMonth))
                .filter(h -> h.getAmount() > 0)
                .mapToInt(PointHistory::getAmount)
                .sum();

        int usedThisMonth = histories.stream()
                .filter(h -> YearMonth.from(h.getCreatedAt()).equals(currentMonth))
                .filter(h -> h.getAmount() < 0)
                .mapToInt(h -> -h.getAmount())
                .sum();

        List<PointHistoryResponse> historyResponses = histories.stream()
                .map(PointHistoryResponse::new)
                .toList();

        return new PointSummaryResponse(
                consumer.getPointBalance(),
                earnedThisMonth,
                usedThisMonth,
                PURCHASE_EARNING_RATE_PERCENT,
                historyResponses
        );
    }
}