package com.storeflow.chat.dto;

import com.storeflow.chat.entity.ChatSession;

import java.time.LocalDateTime;

public class ChatSessionResponse {

    private final String sessionId;
    private final String title;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public ChatSessionResponse(String sessionId,
                               String title,
                               LocalDateTime createdAt,
                               LocalDateTime updatedAt) {
        this.sessionId = sessionId;
        this.title = title;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static ChatSessionResponse from(ChatSession session) {
        return new ChatSessionResponse(
                session.getSessionId(),
                session.getTitle(),
                session.getCreatedAt(),
                session.getUpdatedAt()
        );
    }

    public String getSessionId() { return sessionId; }
    public String getTitle() { return title; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}