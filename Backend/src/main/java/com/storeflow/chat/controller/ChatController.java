package com.storeflow.chat.controller;

import com.storeflow.chat.dto.ChatRequest;
import com.storeflow.chat.dto.ChatResponse;
import com.storeflow.chat.service.ChatService;
import com.storeflow.global.jwt.ConsumerJwtUtil;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;
    private final ConsumerJwtUtil jwtUtil;

    public ChatController(ChatService chatService, ConsumerJwtUtil jwtUtil) {
        this.chatService = chatService;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping
    public ResponseEntity<?> chat(@Valid @RequestBody ChatRequest request,
                                  @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long consumerId = resolveConsumerIdOrNull(authorization);
        try {
            return ResponseEntity.ok(chatService.relay(request, consumerId));
        } catch (SecurityException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        }
    }

    /**
     * 비회원도 채팅 가능해야 하므로 (@CurrentConsumer 는 토큰 없으면 예외를 던져서 여기선 못 씀).
     * 토큰이 있으면 검증해서 consumerId를 쓰고, 없거나 유효하지 않으면 비회원으로 취급한다.
     */
    private Long resolveConsumerIdOrNull(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return null;
        }
        String token = authorization.substring(7);
        if (!jwtUtil.validateToken(token)) {
            return null;
        }
        return jwtUtil.getConsumerIdFromToken(token);
    }
}