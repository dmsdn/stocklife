package com.storeflow.realtime.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.realtime.service.EventBroadcastService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 요구사항 21: 매대 이벤트(8종) + 행동 이벤트(6종) 전부를 SSE 스트림 '하나'로 Agent에 흘려보낸다.
 * Agent가 이 엔드포인트 하나만 구독하면, 발행 시점부터는 InventoryService/ConsumerEventService가
 * 이벤트를 저장한 직후 EventBroadcastService.publishToAgent()로 밀어 넣는 걸 그대로 받는다.
 *
 * SseEmitter를 쓰는 HTTP 클라이언트는 커스텀 헤더를 보낼 수 있으므로(Agent는 브라우저가 아니라 서버),
 * 다른 /internal/** 과 동일하게 X-Internal-Service-Key 헤더로 인증한다.
 */
@RestController
@RequestMapping("/internal/events")
public class AgentEventStreamController {

    private final EventBroadcastService eventBroadcastService;
    private final InternalServiceAuth internalServiceAuth;

    public AgentEventStreamController(EventBroadcastService eventBroadcastService,
                                      InternalServiceAuth internalServiceAuth) {
        this.eventBroadcastService = eventBroadcastService;
        this.internalServiceAuth = internalServiceAuth;
    }

    @GetMapping(value = "/stream", produces = "text/event-stream")
    public ResponseEntity<?> stream(@RequestHeader("X-Internal-Service-Key") String key) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        SseEmitter emitter = eventBroadcastService.subscribeAgent();
        return ResponseEntity.ok(emitter);
    }
}