package com.storeflow.realtime.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.realtime.service.EventBroadcastService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

/**
 * 요구사항 22: 프론트 실시간 중계 채널.
 * 프론트는 이 컨트롤러(백엔드) 하나만 붙잡고 있으면 되고, Agent와는 절대 직접 통신하지 않는다.
 *
 * - GET  /api/realtime/stream?sessionId=...   프론트가 구독 (공개 API)
 * - POST /internal/realtime/push              Agent가 발화/화면 갱신 데이터를 밀어 넣음 (내부 전용)
 *
 * 구독 인증에 대해: 브라우저 EventSource는 커스텀 헤더(Authorization 등)를 못 보낸다.
 * 장보기 세션(session_id)은 이미 프론트가 발급해 들고 있는 비공개 UUID이므로, 다른 조회 API들과
 * 마찬가지로 이 값 자체를 구독 키로 쓴다 — 별도 인증 계층을 새로 만들지 않는다.
 */
@RestController
public class RealtimeController {

    private final EventBroadcastService eventBroadcastService;
    private final InternalServiceAuth internalServiceAuth;

    public RealtimeController(EventBroadcastService eventBroadcastService,
                              InternalServiceAuth internalServiceAuth) {
        this.eventBroadcastService = eventBroadcastService;
        this.internalServiceAuth = internalServiceAuth;
    }

    @GetMapping(value = "/api/realtime/stream", produces = "text/event-stream")
    public SseEmitter stream(@RequestParam String sessionId) {
        return eventBroadcastService.subscribeFrontend(sessionId);
    }

    @PostMapping("/internal/realtime/push")
    public ResponseEntity<?> push(@RequestHeader("X-Internal-Service-Key") String key,
                                  @RequestBody PushRequest request) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        if (request.sessionId == null || request.sessionId.isBlank()
                || request.type == null || request.type.isBlank()) {
            return ResponseEntity.badRequest().body("sessionId, type은 필수입니다.");
        }

        eventBroadcastService.pushToFrontend(
                request.sessionId,
                request.type,
                request.data != null ? request.data : Map.of()
        );

        return ResponseEntity.status(201).build();
    }

    /**
     * type 예시: "bubble"(말풍선 문구), "route_update"(경로선 다시 그리기), "eta_badge"("약 15분 뒤" 배지)
     * data는 Agent가 정하는 자유 형식 — 백엔드는 내용을 해석하지 않고 그대로 중계만 한다.
     */
    public static class PushRequest {
        @NotBlank public String sessionId;
        @NotBlank public String type;
        public Map<String, Object> data;
    }
}