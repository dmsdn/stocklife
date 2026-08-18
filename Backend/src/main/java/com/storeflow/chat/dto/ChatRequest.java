package com.storeflow.chat.dto;

import jakarta.validation.constraints.NotBlank;

public class ChatRequest {

    // 장보기 세션 식별자. 비회원도 프론트가 발급해서 들고 있는 값 (consumer_events.session_id와 동일 체계).
    @NotBlank
    private String sessionId;

    @NotBlank
    private String message;

    public ChatRequest() {}

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}