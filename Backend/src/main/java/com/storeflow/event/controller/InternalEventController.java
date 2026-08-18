package com.storeflow.event.controller;

import com.storeflow.event.entity.ConsumerEvent;
import com.storeflow.event.repository.ConsumerEventRepository;
import com.storeflow.global.internal.InternalServiceAuth;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

/**
 * ★ 재고 갱신 API와 마찬가지로 "이벤트를 기록하는 문은 하나"라는 원칙을 이 테이블에도 적용한다.
 * 원래 ai_search.py의 log_search_event()가 FastAPI에서 MySQL에 직접 INSERT하던 것을
 * 이 엔드포인트 하나로 옮긴다. Agent(FastAPI)는 이제 이 엔드포인트를 호출만 하고 쓰기는 안 한다.
 *
 * consumerId 대신 memberId라는 이름을 쓰는 이유: consumer_events.member_id 컬럼명과 맞춤.
 * X-Internal-Service-Key로 인증하는 것은 InternalCartController/InternalOrderController와 동일한 패턴.
 */
@RestController
@RequestMapping("/internal/events")
public class InternalEventController {

    private final ConsumerEventRepository consumerEventRepository;
    private final InternalServiceAuth internalServiceAuth;

    public InternalEventController(ConsumerEventRepository consumerEventRepository,
                                   InternalServiceAuth internalServiceAuth) {
        this.consumerEventRepository = consumerEventRepository;
        this.internalServiceAuth = internalServiceAuth;
    }

    public record LogEventRequest(
            String eventType,
            String sessionId,
            Long memberId,
            Integer skuId,
            String locationId,
            String payloadJson // 이미 JSON 문자열로 직렬화해서 보낸다 (예: {"query":"우유"})
    ) {}

    @PostMapping
    public ResponseEntity<?> logEvent(
            @RequestHeader("X-Internal-Service-Key") String key,
            @RequestBody LogEventRequest request
    ) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        if (request.eventType() == null || request.sessionId() == null) {
            return ResponseEntity.badRequest().body("eventType, sessionId는 필수입니다.");
        }

        // 검색 이벤트 기록 실패가 검색 자체를 막으면 안 되므로, 여기서 예외를 던지되
        // 호출부(Agent)가 실패를 무시하고 넘어가는 것은 Agent 쪽 책임으로 둔다.
        ConsumerEvent event = new ConsumerEvent(
                request.eventType(),
                request.sessionId(),
                request.memberId(),
                request.skuId(),
                request.locationId(),
                LocalDateTime.now(),
                request.payloadJson()
        );
        consumerEventRepository.save(event);

        return ResponseEntity.status(201).build();
    }
}