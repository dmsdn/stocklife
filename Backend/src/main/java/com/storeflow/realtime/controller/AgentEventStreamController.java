package com.storeflow.realtime.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.realtime.service.EventBroadcastService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 요구사항 21: 매대 이벤트(8종) + 행동 이벤트(6종) 전부를 SSE 스트림 '하나'로 Agent에 흘려보낸다.
 * Agent가 이 엔드포인트 하나만 구독하면, 발행 시점부터는 InventoryService/ConsumerEventService가
 * 이벤트를 저장한 직후 EventBroadcastService.publishToAgent()로 밀어 넣는 걸 그대로 받는다.
 *
 * SseEmitter를 쓰는 HTTP 클라이언트는 커스텀 헤더를 보낼 수 있으므로(Agent는 브라우저가 아니라 서버),
 * 다른 /internal/** 과 동일하게 X-Internal-Service-Key 헤더로 인증한다.
 *
 * ⚠ 반환 타입은 반드시 SseEmitter 그대로여야 한다 — ResponseEntity<?>로 감싸면 Spring MVC의
 * ResponseBodyEmitterReturnValueHandler가 선언된 반환 타입(제네릭 와일드카드)만 보고 SseEmitter로
 * 인식하지 못해 이 메서드를 처리하지 않는다. 그러면 일반 메시지 컨버터로 떨어지는데 SseEmitter를
 * text/event-stream으로 직렬화할 컨버터가 없어 500이 난다(RealtimeController.stream과 동일 이유로
 * 그쪽은 이미 SseEmitter를 그대로 반환한다). 인증 실패도 본문을 담은 ResponseEntity로 못 돌려주므로
 * 상태 코드만 던지는 ResponseStatusException을 쓴다.
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

    /**
     * ⚠ 반환 타입은 반드시 SseEmitter 그대로여야 한다 — ResponseEntity<?> 로 감싸면 500이 난다.
     *
     * Spring MVC는 SseEmitter를 비동기 반환 타입으로 특별 취급하는데(ResponseBodyEmitterReturnValueHandler),
     * 그 핸들러는 **선언된 반환 타입**을 본다. ResponseEntity<?> 는 제네릭이 와일드카드라 본문 타입이
     * SseEmitter로 해석되지 않아 핸들러가 이 메소드를 안 맡는다. 그러면 일반 메시지 컨버터로 떨어지고,
     * SseEmitter 객체를 text/event-stream 으로 직렬화할 컨버터가 없어 500이 된다.
     *
     * 같은 파일의 RealtimeController.stream 은 SseEmitter를 그대로 돌려줘서 정상이다 — 그 차이가 전부였다.
     * 인증 실패는 body를 돌려줄 수 없으므로 ResponseStatusException으로 상태만 세운다.
     */
    @GetMapping(value = "/stream", produces = "text/event-stream")
    public SseEmitter stream(@RequestHeader("X-Internal-Service-Key") String key) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, e.getMessage());
        }

        return eventBroadcastService.subscribeAgent();
    }
}