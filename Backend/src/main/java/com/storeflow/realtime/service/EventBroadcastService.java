package com.storeflow.realtime.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 요구사항 21 (SSE 단일 스트림 → Agent) + 22 (프론트 실시간 중계 채널)의 실제 배선.
 *
 * ① Agent용 스트림: shelf_event(8종) + consumer_event(6종)를 "이미 기록한 걸 그대로" 흘려보낸다.
 *    누가 발행자인지는 상관없이 전부 이 한 스트림 하나로 나간다 — 종류는 SSE event name(type)으로만 구분.
 *    이벤트를 발생시키는 서비스(InventoryService, ConsumerEventService)가 저장 직후 이 서비스를 호출한다.
 *
 * ② 프론트용 스트림: session_id별로 별도 구독. Agent가 만든 말풍선 문구·화면 갱신 데이터를
 *    /internal/realtime/push로 보내면 여기서 해당 세션 구독자에게만 밀어준다.
 *    프론트가 통신하는 상대는 백엔드 하나뿐 — Agent와 직접 연결하지 않는다.
 *
 * 인메모리 구현이라 서버가 여러 대면(멀티 인스턴스) 동작하지 않는다. 지금 규모(데모 1대)에서는 충분하고,
 * 나중에 다중 인스턴스로 가면 Redis Pub/Sub 등으로 이 클래스 내부만 교체하면 된다 (바깥 API는 안 바뀜).
 */
@Service
public class EventBroadcastService {

    private static final Logger log = LoggerFactory.getLogger(EventBroadcastService.class);

    // 타임아웃 0 = 만료 없음. 데모 중 계속 열려 있어야 하므로.
    private static final long NO_TIMEOUT = 0L;

    private final List<SseEmitter> agentEmitters = new CopyOnWriteArrayList<>();
    private final Map<String, List<SseEmitter>> frontendEmittersBySession = new ConcurrentHashMap<>();

    // ---------- Agent 스트림 (21번) ----------

    public SseEmitter subscribeAgent() {
        SseEmitter emitter = new SseEmitter(NO_TIMEOUT);
        agentEmitters.add(emitter);

        emitter.onCompletion(() -> agentEmitters.remove(emitter));
        emitter.onTimeout(() -> agentEmitters.remove(emitter));
        emitter.onError(e -> agentEmitters.remove(emitter));

        sendQuietly(emitter, "connected", Map.of("stream", "agent"));
        return emitter;
    }

    /**
     * shelf_event / consumer_event 저장 직후 호출.
     * type: ShelfEvent.EventType 또는 ConsumerEvent.EventType의 name() 그대로 사용 — 8종+6종 철자가 곧 계약이므로
     * 여기서 별도로 문자열을 다시 만들지 않는다.
     */
    public void publishToAgent(String type, Map<String, Object> data) {
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            var snapshot = new java.util.HashMap<>(data);
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override public void afterCommit() { deliverToAgent(type, snapshot); }
                });
        } else { deliverToAgent(type, data); }
    }

    private void deliverToAgent(String type, Map<String, Object> data) {
        if (agentEmitters.isEmpty()) {
            return; // Agent가 아직 구독 전이어도 기록 자체는 이미 끝났으므로 조용히 무시
        }
        for (SseEmitter emitter : agentEmitters) {
            sendQuietly(emitter, type, data);
        }
    }

    // ---------- 프론트 스트림 (22번) ----------

    public SseEmitter subscribeFrontend(String sessionId) {
        SseEmitter emitter = new SseEmitter(NO_TIMEOUT);
        frontendEmittersBySession
                .computeIfAbsent(sessionId, key -> new CopyOnWriteArrayList<>())
                .add(emitter);

        Runnable cleanup = () -> {
            List<SseEmitter> emitters = frontendEmittersBySession.get(sessionId);
            if (emitters != null) {
                emitters.remove(emitter);
                if (emitters.isEmpty()) {
                    frontendEmittersBySession.remove(sessionId, emitters);
                }
            }
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());

        sendQuietly(emitter, "connected", Map.of("stream", "frontend", "sessionId", sessionId));
        return emitter;
    }

    /**
     * Agent가 /internal/realtime/push로 보낸 걸 해당 세션 구독자에게 그대로 전달.
     * type 예: "chat_message"(말풍선), "route_update"(경로선 다시 그리기), "eta_badge"("약 15분 뒤" 배지)
     * 구독 중인 프론트가 없으면(아직 접속 전/이미 닫음) 조용히 버린다 — 실시간 채널은 유실을 감수한다.
     */
    public void pushToFrontend(String sessionId, String type, Map<String, Object> data) {
        List<SseEmitter> emitters = frontendEmittersBySession.get(sessionId);
        if (emitters == null || emitters.isEmpty()) {
            return;
        }
        for (SseEmitter emitter : emitters) {
            sendQuietly(emitter, type, data);
        }
    }

    private void sendQuietly(SseEmitter emitter, String eventName, Object data) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data));
        } catch (IOException | IllegalStateException e) {
            // 끊긴 연결에 쓰다 나는 에러 — 스트림 하나 실패가 다른 구독자한테 영향 주면 안 되므로 로그만 남긴다.
            log.debug("SSE 전송 실패, emitter 정리: {}", e.getMessage());
            // ⚠ 09-02 시연 점검: 이미 닫힌 emitter 에 completeWithError 를 부르면 그 자체가
            //   IllegalStateException 을 다시 던진다 — 이 catch 밖이라 컨트롤러까지 올라가
            //   POST /api/events 가 500 이 되고 @Transactional 이 저장을 롤백했다
            //   (event_id 가 하나 비는 것으로 관측). FastAPI 를 재기동할 때마다 옛 구독이
            //   죽은 emitter 로 남아 "재기동 뒤 첫 스캔이 증발"하는 모양이었다.
            //   정리는 목록에서 먼저 빼고, complete 는 실패해도 삼킨다.
            agentEmitters.remove(emitter);
            frontendEmittersBySession.values().forEach(list -> list.remove(emitter));
            try {
                emitter.completeWithError(e);
            } catch (RuntimeException ignored) {
                // 이미 완료된 emitter — 정리는 위에서 끝났다.
            }
        }
    }
}