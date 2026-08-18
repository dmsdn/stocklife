package com.storeflow.inventory.service;

import com.storeflow.inventory.entity.ConsumerEvent;
import com.storeflow.inventory.repository.ConsumerEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class ConsumerEventService {

    private final ConsumerEventRepository consumerEventRepository;

    public ConsumerEventService(ConsumerEventRepository consumerEventRepository) {
        this.consumerEventRepository = consumerEventRepository;
    }

    @Transactional
    public void record(ConsumerEvent.EventType eventType, String sessionId, Integer memberId,
                        Integer skuId, String locationId, String payload) {
        if (eventType == ConsumerEvent.EventType.SCAN_ADD && locationId == null) {
            throw new IllegalArgumentException("SCAN_ADD 이벤트는 locationId가 필수입니다.");
        }
        consumerEventRepository.save(new ConsumerEvent(
                eventType, sessionId, memberId, skuId, locationId, Instant.now(), payload));
    }
}