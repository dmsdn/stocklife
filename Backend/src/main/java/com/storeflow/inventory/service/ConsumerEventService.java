package com.storeflow.inventory.service;

import com.storeflow.inventory.entity.ConsumerEvent;
import com.storeflow.inventory.repository.ConsumerEventRepository;
import com.storeflow.realtime.service.EventBroadcastService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Service
public class ConsumerEventService {

    private final ConsumerEventRepository consumerEventRepository;
    private final EventBroadcastService eventBroadcastService;

    public ConsumerEventService(ConsumerEventRepository consumerEventRepository,
                                EventBroadcastService eventBroadcastService) {
        this.consumerEventRepository = consumerEventRepository;
        this.eventBroadcastService = eventBroadcastService;
    }

    @Transactional
    public void record(ConsumerEvent.EventType eventType, String sessionId, Integer memberId,
                       Integer skuId, String locationId, String payload) {
        if (eventType == ConsumerEvent.EventType.SCAN_ADD && locationId == null) {
            throw new IllegalArgumentException("SCAN_ADD 이벤트는 locationId가 필수입니다.");
        }
        ConsumerEvent saved = consumerEventRepository.save(new ConsumerEvent(
                eventType, sessionId, memberId, skuId, locationId, Instant.now(), payload));

        // 요구사항 21: 행동 이벤트(6종)도 매대 이벤트와 같은 스트림 하나로 나간다.
        Map<String, Object> data = new HashMap<>();
        data.put("sessionId", saved.getSessionId());
        data.put("memberId", saved.getMemberId());
        data.put("skuId", saved.getSkuId());
        data.put("locationId", saved.getLocationId());
        data.put("occurredAt", saved.getOccurredAt().toString());
        eventBroadcastService.publishToAgent(saved.getEventType().name(), data);
    }
}