package com.storeflow.chat.dto;

import java.util.List;

/** Backend -> Agent(/agent/chat) 요청 바디. Agent는 이 안에서만 판단하고 DB에 직접 쓰지 않는다. */
public class AgentChatRequest {

    private String sessionId;
    private Long consumerId;       // 비회원이면 null
    private String message;
    private List<HistoryTurn> history; // 최근 대화 (오래된 순)

    public AgentChatRequest() {}

    public AgentChatRequest(String sessionId, Long consumerId, String message, List<HistoryTurn> history) {
        this.sessionId = sessionId;
        this.consumerId = consumerId;
        this.message = message;
        this.history = history;
    }

    public String getSessionId() { return sessionId; }
    public Long getConsumerId() { return consumerId; }
    public String getMessage() { return message; }
    public List<HistoryTurn> getHistory() { return history; }

    public static class HistoryTurn {
        private String role;   // "user" | "assistant"
        private String content;

        public HistoryTurn() {}

        public HistoryTurn(String role, String content) {
            this.role = role;
            this.content = content;
        }

        public String getRole() { return role; }
        public String getContent() { return content; }
    }
}