package com.storeflow.chat.controller;

import com.storeflow.chat.dto.ChatRequest;
import com.storeflow.chat.dto.ChatSessionResponse;
import com.storeflow.chat.dto.CreateChatSessionRequest;
import com.storeflow.chat.service.ChatService;
import com.storeflow.global.jwt.ConsumerJwtUtil;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClientException;

import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;
    private final ConsumerJwtUtil jwtUtil;

    public ChatController(ChatService chatService, ConsumerJwtUtil jwtUtil) {
        this.chatService = chatService;
        this.jwtUtil = jwtUtil;
    }

    /**
     * 기존 채팅 전송 API.
     *
     * 로그인: Authorization: Bearer <JWT>
     * 비회원(권장): X-Chat-Client-Id: <브라우저/앱이 보관하는 UUID>
     */
    @PostMapping
    public ResponseEntity<?> chat(
            @Valid @RequestBody ChatRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "X-Chat-Client-Id", required = false) String anonymousId
    ) {
        try {
            Long consumerId = resolveConsumerIdOrNull(authorization);

            return ResponseEntity.ok(
                    chatService.relay(request, consumerId, anonymousId)
            );
        } catch (SecurityException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (RestClientException e) {
            // Agent(FastAPI, agent.base-url) 서버가 안 떠 있거나 응답을 못 줄 때 여기로 온다.
            // 예전엔 이 예외를 아무 데서도 안 잡아서 500이 그냥 나갔는데, 502로 명확히
            // 구분해두면 "Agent 서버가 꺼져있다"는 걸 프론트/로그에서 바로 알아볼 수 있다.
            return ResponseEntity.status(502).body("AI Agent 서버에 연결할 수 없습니다. Agent(FastAPI) 서버가 켜져 있는지 확인하세요.");
        }
    }

    /**
     * 5-1: 새 채팅 만들기.
     *
     * POST /api/chat/sessions
     * 바디는 선택: { "groupId": 123 } 을 보내면 그 장보기 리스트에 묶인 대화로 시작된다.
     * (비회원은 groupId를 보내도 무시됨 — 리스트는 로그인 회원 전용 기능이라서.)
     */
    @PostMapping("/sessions")
    public ResponseEntity<?> createSession(
            @RequestBody(required = false) CreateChatSessionRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "X-Chat-Client-Id", required = false) String anonymousId
    ) {
        try {
            Long consumerId = resolveConsumerIdOrNull(authorization);
            Long groupId = request == null ? null : request.getGroupId();

            return ResponseEntity.ok(
                    chatService.createSession(consumerId, anonymousId, groupId)
            );
        } catch (SecurityException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * 5-1: 내 채팅 목록 조회.
     *
     * GET /api/chat/sessions
     */
    @GetMapping("/sessions")
    public ResponseEntity<?> getSessions(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "X-Chat-Client-Id", required = false) String anonymousId
    ) {
        try {
            Long consumerId = resolveConsumerIdOrNull(authorization);

            return ResponseEntity.ok(
                    chatService.getSessions(consumerId, anonymousId)
            );
        } catch (SecurityException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * 5-1: 특정 채팅방 정보 조회.
     *
     * GET /api/chat/sessions/{sessionId}
     */
    @GetMapping("/sessions/{sessionId}")
    public ResponseEntity<?> getSession(
            @PathVariable String sessionId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "X-Chat-Client-Id", required = false) String anonymousId
    ) {
        try {
            Long consumerId = resolveConsumerIdOrNull(authorization);

            ChatSessionResponse response =
                    chatService.getSession(sessionId, consumerId, anonymousId);

            return ResponseEntity.ok(response);

        } catch (NoSuchElementException e) {
            return ResponseEntity.status(404).body(e.getMessage());
        } catch (SecurityException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * 5-1 + 5-2:
     * 지난 채팅창을 다시 열기 위한 전체 메시지 조회.
     *
     * GET /api/chat/sessions/{sessionId}/messages
     */
    @GetMapping("/sessions/{sessionId}/messages")
    public ResponseEntity<?> getMessages(
            @PathVariable String sessionId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "X-Chat-Client-Id", required = false) String anonymousId
    ) {
        try {
            Long consumerId = resolveConsumerIdOrNull(authorization);

            return ResponseEntity.ok(
                    chatService.getMessages(sessionId, consumerId, anonymousId)
            );
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(404).body(e.getMessage());
        } catch (SecurityException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * 3번: 대화 내용 검색.
     *
     * GET /api/chat/search?keyword=우유
     * 매칭된 세션들을, 세션별 최근 매칭 메시지 5개와 함께 최신순으로 반환한다.
     */
    @GetMapping("/search")
    public ResponseEntity<?> search(
            @RequestParam String keyword,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "X-Chat-Client-Id", required = false) String anonymousId
    ) {
        try {
            Long consumerId = resolveConsumerIdOrNull(authorization);

            return ResponseEntity.ok(
                    chatService.searchMessages(consumerId, anonymousId, keyword)
            );
        } catch (SecurityException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * 비회원도 채팅 가능해야 하므로 토큰이 아예 없으면 null.
     * 토큰이 전달됐는데 잘못된 토큰이면 비회원으로 강등하지 않고 403 처리한다.
     */
    private Long resolveConsumerIdOrNull(String authorization) {
        if (authorization == null || authorization.isBlank()) {
            return null;
        }

        if (!authorization.startsWith("Bearer ")) {
            throw new SecurityException("Authorization 헤더 형식이 올바르지 않습니다.");
        }

        String token = authorization.substring(7);

        if (!jwtUtil.validateToken(token)) {
            throw new SecurityException("유효하지 않은 인증 토큰입니다.");
        }

        return jwtUtil.getConsumerIdFromToken(token);
    }
}