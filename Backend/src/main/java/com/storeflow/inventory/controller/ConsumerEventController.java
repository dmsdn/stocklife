package com.storeflow.inventory.controller;

import com.storeflow.consumer.entity.Member;
import com.storeflow.global.jwt.ConsumerJwtUtil;
import com.storeflow.inventory.entity.ConsumerEvent;
import com.storeflow.inventory.service.ConsumerEventService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** 요구사항정의서 19번. 비회원도 호출 가능 — 토큰 없으면 memberId는 null로 기록됨. */
@RestController
@RequestMapping("/api/events")
public class ConsumerEventController {

    private final ConsumerEventService consumerEventService;
    private final ConsumerJwtUtil jwtUtil;

    public ConsumerEventController(ConsumerEventService consumerEventService,
                                    ConsumerJwtUtil jwtUtil) {
        this.consumerEventService = consumerEventService;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping
    public ResponseEntity<Void> record(@Valid @RequestBody ConsumerEventRequest request,
                                        @RequestHeader(value = "Authorization", required = false) String authorization) {
        Integer memberId = resolveMemberIdOrNull(authorization);
        consumerEventService.record(request.getEventType(), request.getSessionId(), memberId,
                request.getSkuId(), request.getLocationId(), request.getPayload());
        return ResponseEntity.status(201).build();
    }

    // member_id는 이제 DB 조회 없이 JWT의 consumerId로 바로 계산한다(Member.toMemberId).
    private Integer resolveMemberIdOrNull(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return null;
        }
        String token = authorization.substring(7);
        if (!jwtUtil.validateToken(token)) {
            return null;
        }
        Long consumerId = jwtUtil.getConsumerIdFromToken(token);
        return Member.toMemberId(consumerId);
    }

    public static class ConsumerEventRequest {
        @NotNull private ConsumerEvent.EventType eventType;
        @NotBlank private String sessionId;
        private Integer skuId;
        private String locationId;
        private String payload;

        public ConsumerEvent.EventType getEventType() { return eventType; }
        public void setEventType(ConsumerEvent.EventType eventType) { this.eventType = eventType; }
        public String getSessionId() { return sessionId; }
        public void setSessionId(String sessionId) { this.sessionId = sessionId; }
        public Integer getSkuId() { return skuId; }
        public void setSkuId(Integer skuId) { this.skuId = skuId; }
        public String getLocationId() { return locationId; }
        public void setLocationId(String locationId) { this.locationId = locationId; }
        public String getPayload() { return payload; }
        public void setPayload(String payload) { this.payload = payload; }
    }
}