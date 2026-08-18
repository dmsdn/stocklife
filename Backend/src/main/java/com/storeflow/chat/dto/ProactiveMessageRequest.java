package com.storeflow.chat.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Agent가 먼저 건 개입 발화(AI_PROACTIVE)를 이력에 남기기 위한 내부 요청 바디.
 * 사용자가 보낸 요청이 아니라 Agent(FastAPI)가 서버 대 서버로 호출하므로
 * X-Internal-Service-Key로 인증하고, JWT 관련 필드는 받지 않는다.
 */
public class ProactiveMessageRequest {

    // 어떤 채팅방에 남길지 (ChatSession.sessionId, 공개 UUID)
    @NotBlank
    private String sessionId;

    // 개입 발화 내용 (예: "늘 사시던 물티슈 자리가 바뀌었어요")
    @NotBlank
    private String content;

    public ProactiveMessageRequest() {}

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}