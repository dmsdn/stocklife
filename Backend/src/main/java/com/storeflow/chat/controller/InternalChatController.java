package com.storeflow.chat.controller;

import com.storeflow.chat.dto.ChatMessageResponse;
import com.storeflow.chat.dto.ProactiveMessageRequest;
import com.storeflow.chat.service.ChatService;
import com.storeflow.global.internal.InternalServiceAuth;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.NoSuchElementException;

/**
 * Agent 서버(ai-server) 전용 내부 엔드포인트. InternalOrderController/InternalCartController와 동일한 패턴이다.
 * Agent가 스트림(SSE)을 보다가 "먼저 말 걸기"를 하기로 판단하면 이 API로 발화를 보내고,
 * 백엔드는 그걸 chat_message에 AI_PROACTIVE로 저장한다 (요구사항 24번: 개입 발화도 같은 이력에 남긴다).
 *
 * 프론트는 절대 이 경로를 직접 호출하면 안 된다.
 */
@RestController
@RequestMapping("/internal/chat")
public class InternalChatController {

    private final ChatService chatService;
    private final InternalServiceAuth internalServiceAuth;

    public InternalChatController(ChatService chatService, InternalServiceAuth internalServiceAuth) {
        this.chatService = chatService;
        this.internalServiceAuth = internalServiceAuth;
    }

    @PostMapping("/proactive")
    public ResponseEntity<?> saveProactiveMessage(
            @RequestHeader("X-Internal-Service-Key") String key,
            @Valid @RequestBody ProactiveMessageRequest request) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        try {
            ChatMessageResponse saved =
                    chatService.saveProactiveMessage(request.getSessionId(), request.getContent());

            return ResponseEntity.ok(saved);
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(404).body(e.getMessage());
        }
    }
}